/**
 * AnomalyDetectionService
 * Phase 3 — Predictive Maintenance
 *
 * Implements Isolation Forest scoring for detecting novel anomaly patterns
 * in CNC machine telemetry that are not covered by supervised models.
 *
 * The Isolation Forest works by randomly isolating observations:
 * - Anomalies require fewer splits (shorter path length) to isolate
 * - Normal points require more splits (longer path length)
 * - Score normalized to [0, 1] where 1 = most anomalous
 *
 * Reference: Liu, Ting & Zhou (2008) "Isolation Forest"
 * Configuration per Phase 3 design:
 *   n_estimators: 200, max_samples: 256, contamination: 0.02
 */

import { Logger } from 'pino';

import {
  AnomalyScore,
  FeatureVector,
} from '../types/maintenance';

// ─── Isolation Tree Node ─────────────────────────────────────────────

interface ITreeNode {
  type: 'internal' | 'leaf';
}

interface InternalNode extends ITreeNode {
  type: 'internal';
  splitFeature: number;
  splitValue: number;
  left: ITreeNode;
  right: ITreeNode;
}

interface LeafNode extends ITreeNode {
  type: 'leaf';
  size: number;
}

// ─── Configuration ───────────────────────────────────────────────────

export interface AnomalyDetectionConfig {
  /** Number of isolation trees in the forest */
  nEstimators: number;
  /** Subsample size for each tree */
  maxSamples: number;
  /** Expected proportion of anomalies (affects threshold) */
  contamination: number;
  /** Maximum tree depth (log2(maxSamples)) */
  maxDepth: number;
  /** Score threshold for anomaly alert */
  alertThreshold: number;
  /** Random seed for reproducibility */
  randomSeed: number;
}

export const DEFAULT_ANOMALY_CONFIG: AnomalyDetectionConfig = {
  nEstimators: 200,
  maxSamples: 256,
  contamination: 0.02,
  maxDepth: Math.ceil(Math.log2(256)), // 8
  alertThreshold: 0.75,
  randomSeed: 42,
};

// ─── Service ─────────────────────────────────────────────────────────

export class AnomalyDetectionService {
  private config: AnomalyDetectionConfig;
  private logger: Logger;
  private forest: ITreeNode[] = [];
  private isTrained = false;
  private trainingSize = 0;

  /** Average path length of unsuccessful search in BST — used for normalization */
  private c_n = 0;

  constructor(deps: { config?: Partial<AnomalyDetectionConfig>; logger: Logger }) {
    this.config = { ...DEFAULT_ANOMALY_CONFIG, ...deps.config };
    this.logger = deps.logger.child({ service: 'AnomalyDetection' });
  }

  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Train the Isolation Forest on a set of "healthy" feature vectors.
   * Should be called with data representing normal operating conditions.
   */
  train(trainingData: number[][]): void {
    if (trainingData.length < 2) {
      throw new Error('Training requires at least 2 samples');
    }

    const { nEstimators, maxSamples, maxDepth } = this.config;
    this.trainingSize = Math.min(maxSamples, trainingData.length);
    this.c_n = this.averagePathLength(this.trainingSize);
    this.forest = [];

    const rng = this.createRng(this.config.randomSeed);

    for (let i = 0; i < nEstimators; i++) {
      const subsample = this.subsample(trainingData, this.trainingSize, rng);
      const tree = this.buildTree(subsample, 0, maxDepth, rng);
      this.forest.push(tree);
    }

    this.isTrained = true;
    this.logger.info({
      msg: 'Isolation Forest trained',
      nEstimators,
      maxSamples: this.trainingSize,
      featureDim: trainingData[0]?.length ?? 0,
    });
  }

  /**
   * Score a single observation. Returns anomaly score [0, 1].
   * Higher score = more anomalous.
   */
  score(sample: number[]): number {
    if (!this.isTrained) {
      throw new Error('Model not trained. Call train() first.');
    }

    const pathLengths = this.forest.map((tree) => this.pathLength(sample, tree, 0));
    const avgPathLength = pathLengths.reduce((a, b) => a + b, 0) / pathLengths.length;

    // Anomaly score: s(x, n) = 2^(-E(h(x)) / c(n))
    const score = Math.pow(2, -avgPathLength / this.c_n);
    return Math.max(0, Math.min(1, score)); // clamp [0, 1]
  }

  /**
   * Score a FeatureVector and produce a full AnomalyScore result.
   */
  scoreFeatureVector(featureVector: FeatureVector): AnomalyScore {
    const numericVector = this.featureVectorToNumeric(featureVector);
    const isolationForestScore = this.score(numericVector);
    const isAnomaly = isolationForestScore > this.config.alertThreshold;

    return {
      machineId: featureVector.machineId,
      componentType: featureVector.componentType,
      timestamp: featureVector.timestamp,
      score: isolationForestScore,
      isolationForestScore,
      autoEncoderResidual: 0, // placeholder — autoencoder not implemented yet
      threshold: this.config.alertThreshold,
      isAnomaly,
    };
  }

  /**
   * Batch-score multiple feature vectors.
   */
  scoreBatch(featureVectors: FeatureVector[]): AnomalyScore[] {
    return featureVectors.map((fv) => this.scoreFeatureVector(fv));
  }

  /**
   * Determine the anomaly threshold dynamically from a reference dataset.
   * Sets threshold at the (1 - contamination) percentile of scores.
   */
  calibrateThreshold(referenceData: number[][]): number {
    if (!this.isTrained) {
      throw new Error('Model not trained. Call train() first.');
    }

    const scores = referenceData.map((sample) => this.score(sample));
    scores.sort((a, b) => a - b);

    const percentileIdx = Math.floor(scores.length * (1 - this.config.contamination));
    const threshold = scores[Math.min(percentileIdx, scores.length - 1)] ?? this.config.alertThreshold;

    this.config.alertThreshold = threshold;
    this.logger.info({
      msg: 'Threshold calibrated',
      threshold,
      contamination: this.config.contamination,
      refSize: referenceData.length,
    });

    return threshold;
  }

  /**
   * Check if model is trained and ready for inference.
   */
  isReady(): boolean {
    return this.isTrained;
  }

  /**
   * Get model metadata for monitoring/registry.
   */
  getModelInfo(): {
    isTrained: boolean;
    nEstimators: number;
    trainingSize: number;
    threshold: number;
    contamination: number;
  } {
    return {
      isTrained: this.isTrained,
      nEstimators: this.config.nEstimators,
      trainingSize: this.trainingSize,
      threshold: this.config.alertThreshold,
      contamination: this.config.contamination,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // ISOLATION TREE CONSTRUCTION
  // ═══════════════════════════════════════════════════════════════════

  /** Build a single isolation tree recursively */
  private buildTree(
    data: number[][],
    currentDepth: number,
    maxDepth: number,
    rng: () => number,
  ): ITreeNode {
    const n = data.length;

    // Termination: max depth reached or too few samples
    if (currentDepth >= maxDepth || n <= 1) {
      return { type: 'leaf', size: n } as LeafNode;
    }

    const numFeatures = data[0]?.length ?? 0;
    if (numFeatures === 0) {
      return { type: 'leaf', size: n } as LeafNode;
    }

    // Randomly select a feature to split on
    const splitFeature = Math.floor(rng() * numFeatures);

    // Find min/max for the selected feature
    let min = Infinity;
    let max = -Infinity;
    for (const row of data) {
      const val = row[splitFeature]!;
      if (val < min) min = val;
      if (val > max) max = val;
    }

    // If all values are the same, can't split further
    if (min === max) {
      return { type: 'leaf', size: n } as LeafNode;
    }

    // Random split point between min and max
    const splitValue = min + rng() * (max - min);

    // Partition data
    const leftData: number[][] = [];
    const rightData: number[][] = [];
    for (const row of data) {
      if (row[splitFeature]! < splitValue) {
        leftData.push(row);
      } else {
        rightData.push(row);
      }
    }

    return {
      type: 'internal',
      splitFeature,
      splitValue,
      left: this.buildTree(leftData, currentDepth + 1, maxDepth, rng),
      right: this.buildTree(rightData, currentDepth + 1, maxDepth, rng),
    } as InternalNode;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PATH LENGTH COMPUTATION
  // ═══════════════════════════════════════════════════════════════════

  /** Compute path length for a sample through a tree */
  private pathLength(sample: number[], node: ITreeNode, currentDepth: number): number {
    if (node.type === 'leaf') {
      const leafSize = (node as LeafNode).size;
      // Add adjustment for leaf size > 1 (unbuilt subtree)
      return currentDepth + this.averagePathLength(leafSize);
    }

    const internal = node as InternalNode;
    const value = sample[internal.splitFeature] ?? 0;

    if (value < internal.splitValue) {
      return this.pathLength(sample, internal.left, currentDepth + 1);
    } else {
      return this.pathLength(sample, internal.right, currentDepth + 1);
    }
  }

  /**
   * Average path length of unsuccessful search in a Binary Search Tree (BST)
   * c(n) = 2H(n-1) - 2(n-1)/n, where H(i) is the harmonic number
   * Used to normalize the path length
   */
  averagePathLength(n: number): number {
    if (n <= 1) return 0;
    if (n === 2) return 1;
    const harmonicNumber = Math.log(n - 1) + 0.5772156649; // Euler-Mascheroni constant
    return 2 * harmonicNumber - (2 * (n - 1)) / n;
  }

  // ═══════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════

  /** Convert FeatureVector (structured) to flat numeric array for scoring */
  featureVectorToNumeric(fv: FeatureVector): number[] {
    const td = fv.timeDomain;
    const fd = fv.frequencyDomain;
    const tr = fv.trend;

    return [
      // Time domain (9 features)
      td.rms,
      td.kurtosis,
      td.crestFactor,
      td.skewness,
      td.shapeFactor,
      td.peak,
      td.peakToPeak,
      td.mean,
      td.standardDeviation,
      // Frequency domain (5 features)
      fd.dominantFrequency,
      fd.dominantAmplitude,
      fd.spectralKurtosis,
      fd.totalEnergy,
      fd.meanFrequency,
      // Trend (4 features)
      tr.slope,
      tr.acceleration,
      tr.ewma,
      tr.ewmaDeviation,
    ];
  }

  /** Random subsampling without replacement */
  private subsample(data: number[][], size: number, rng: () => number): number[][] {
    if (data.length <= size) return [...data];

    const indices = new Set<number>();
    while (indices.size < size) {
      indices.add(Math.floor(rng() * data.length));
    }

    return [...indices].map((i) => data[i]!);
  }

  /** Simple seeded PRNG (Mulberry32) for reproducibility */
  private createRng(seed: number): () => number {
    let state = seed;
    return () => {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}
