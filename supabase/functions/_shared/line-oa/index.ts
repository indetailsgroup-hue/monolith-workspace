// Shared pure-logic for LINE OA Commerce (Module B5).
// Feature: line-oa-commerce
//
// Dependency-free domain logic shared by the Edge Functions, the SECURITY DEFINER
// RPC composition paths, and the property-based tests. Re-export new shared
// modules here as they are added by later tasks (adapters, brand-voice, template
// classification, etc.).

export * from "./autonomyGate";
