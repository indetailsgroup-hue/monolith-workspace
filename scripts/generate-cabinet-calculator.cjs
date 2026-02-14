/**
 * Cabinet Calculator Excel Generator
 * สร้าง Excel file สำหรับตรวจสอบสูตรคำนวณตู้
 * ผูกทุก Cell เหมือนในโปรแกรมจริง
 *
 * Usage: node scripts/generate-cabinet-calculator.cjs
 */

const ExcelJS = require('exceljs');
const path = require('path');

async function generateCalculator() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IIMOS Designer';
  workbook.created = new Date();

  // ============================================
  // SHEET 1: Panel Calculator (Fully Linked)
  // ============================================
  const calcSheet = workbook.addWorksheet('Panel Calculator', {
    properties: { tabColor: { argb: '4472C4' } }
  });

  // Column widths
  calcSheet.columns = [
    { width: 25 },  // A - Label
    { width: 15 },  // B - Value
    { width: 10 },  // C - Unit
    { width: 5 },   // D - Spacer
    { width: 25 },  // E - Label
    { width: 15 },  // F - Value
    { width: 12 },  // G - Unit
    { width: 30 },  // H - Notes
  ];

  // Styles
  const inputStyle = {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF99' } },
    border: { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} }
  };

  const calcStyle = {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9EAD3' } },
    border: { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} }
  };

  // Title
  calcSheet.mergeCells('A1:H1');
  calcSheet.getCell('A1').value = 'IIMOS Cabinet Panel Calculator (Fully Linked)';
  calcSheet.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FFFFFF' } };
  calcSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2E75B6' } };
  calcSheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  calcSheet.getRow(1).height = 30;

  // ========== INPUT SECTION ==========
  // Section: Cabinet Dimensions (INPUT)
  calcSheet.getCell('A3').value = 'CABINET DIMENSIONS (INPUT)';
  calcSheet.getCell('A3').font = { bold: true, size: 12, color: { argb: 'FFFFFF' } };
  calcSheet.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '5B9BD5' } };
  calcSheet.mergeCells('A3:C3');

  // B4 = W (Width)
  calcSheet.getCell('A4').value = 'Width (W)';
  calcSheet.getCell('B4').value = 1200;
  calcSheet.getCell('B4').style = inputStyle;
  calcSheet.getCell('B4').numFmt = '0';
  calcSheet.getCell('C4').value = 'mm';

  // B5 = H (Height)
  calcSheet.getCell('A5').value = 'Height (H)';
  calcSheet.getCell('B5').value = 1000;
  calcSheet.getCell('B5').style = inputStyle;
  calcSheet.getCell('B5').numFmt = '0';
  calcSheet.getCell('C5').value = 'mm';

  // B6 = D (Depth)
  calcSheet.getCell('A6').value = 'Depth (D)';
  calcSheet.getCell('B6').value = 600;
  calcSheet.getCell('B6').style = inputStyle;
  calcSheet.getCell('B6').numFmt = '0';
  calcSheet.getCell('C6').value = 'mm';

  // Section: Material Parameters (INPUT)
  calcSheet.getCell('E3').value = 'MATERIAL PARAMETERS (INPUT)';
  calcSheet.getCell('E3').font = { bold: true, size: 12, color: { argb: 'FFFFFF' } };
  calcSheet.getCell('E3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '5B9BD5' } };
  calcSheet.mergeCells('E3:H3');

  // F4 = Core Thickness (T)
  calcSheet.getCell('E4').value = 'Core Thickness (T)';
  calcSheet.getCell('F4').value = 16;
  calcSheet.getCell('F4').style = inputStyle;
  calcSheet.getCell('F4').numFmt = '0.0';
  calcSheet.getCell('G4').value = 'mm';
  calcSheet.getCell('H4').value = 'PB/MDF/HMR';

  // F5 = Surface Thickness
  calcSheet.getCell('E5').value = 'Surface Thickness';
  calcSheet.getCell('F5').value = 0.7;
  calcSheet.getCell('F5').style = inputStyle;
  calcSheet.getCell('F5').numFmt = '0.0';
  calcSheet.getCell('G5').value = 'mm';
  calcSheet.getCell('H5').value = 'Melamine/HPL';

  // F6 = Edge Thickness (ET)
  calcSheet.getCell('E6').value = 'Edge Thickness (ET)';
  calcSheet.getCell('F6').value = 1;
  calcSheet.getCell('F6').style = inputStyle;
  calcSheet.getCell('F6').numFmt = '0.0';
  calcSheet.getCell('G6').value = 'mm';
  calcSheet.getCell('H6').value = 'PVC/ABS';

  // Section: Manufacturing Parameters
  calcSheet.getCell('A8').value = 'MANUFACTURING PARAMETERS';
  calcSheet.getCell('A8').font = { bold: true, size: 12, color: { argb: 'FFFFFF' } };
  calcSheet.getCell('A8').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '70AD47' } };
  calcSheet.mergeCells('A8:C8');

  // B9 = Groove Depth
  calcSheet.getCell('A9').value = 'Groove Depth';
  calcSheet.getCell('B9').value = 8;
  calcSheet.getCell('B9').style = inputStyle;
  calcSheet.getCell('B9').numFmt = '0';
  calcSheet.getCell('C9').value = 'mm';

  // B10 = Clearance
  calcSheet.getCell('A10').value = 'Clearance';
  calcSheet.getCell('B10').value = 2;
  calcSheet.getCell('B10').style = inputStyle;
  calcSheet.getCell('B10').numFmt = '0';
  calcSheet.getCell('C10').value = 'mm';

  // B11 = Back Panel Thickness
  calcSheet.getCell('A11').value = 'Back Panel Thickness';
  calcSheet.getCell('B11').value = 6;
  calcSheet.getCell('B11').style = inputStyle;
  calcSheet.getCell('B11').numFmt = '0';
  calcSheet.getCell('C11').value = 'mm';

  // Joint Type Configuration
  calcSheet.getCell('E8').value = 'JOINT CONFIGURATION';
  calcSheet.getCell('E8').font = { bold: true, size: 12, color: { argb: 'FFFFFF' } };
  calcSheet.getCell('E8').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '70AD47' } };
  calcSheet.mergeCells('E8:H8');

  // F9 = Top Joint
  calcSheet.getCell('E9').value = 'Top Joint';
  calcSheet.getCell('F9').value = 'INSET';
  calcSheet.getCell('F9').style = inputStyle;
  calcSheet.getCell('G9').value = '';
  calcSheet.getCell('H9').value = '(พิมพ์ INSET หรือ OVERLAY)';

  // F10 = Bottom Joint
  calcSheet.getCell('E10').value = 'Bottom Joint';
  calcSheet.getCell('F10').value = 'INSET';
  calcSheet.getCell('F10').style = inputStyle;
  calcSheet.getCell('G10').value = '';
  calcSheet.getCell('H10').value = '(พิมพ์ INSET หรือ OVERLAY)';

  // ========== CALCULATED VALUES SECTION ==========
  calcSheet.getCell('A13').value = 'CALCULATED VALUES (Auto)';
  calcSheet.getCell('A13').font = { bold: true, size: 12, color: { argb: 'FFFFFF' } };
  calcSheet.getCell('A13').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7030A0' } };
  calcSheet.mergeCells('A13:C13');

  // B14 = T_real (Real Thickness)
  calcSheet.getCell('A14').value = 'T_real (Real Thickness)';
  calcSheet.getCell('B14').value = { formula: 'F4+(F5*2)' };
  calcSheet.getCell('B14').numFmt = '0.0';
  calcSheet.getCell('B14').style = calcStyle;
  calcSheet.getCell('C14').value = 'mm';

  // B15 = T_joint (for joint calc) - uses T_real because physical interference is based on actual thickness
  calcSheet.getCell('A15').value = 'T_joint (= T_real)';
  calcSheet.getCell('B15').value = { formula: 'B14' };  // Use T_real for joint calculations
  calcSheet.getCell('B15').numFmt = '0.0';
  calcSheet.getCell('B15').style = calcStyle;
  calcSheet.getCell('C15').value = 'mm';

  // Calculated Joint Reductions
  calcSheet.getCell('E13').value = 'JOINT REDUCTIONS (Auto)';
  calcSheet.getCell('E13').font = { bold: true, size: 12, color: { argb: 'FFFFFF' } };
  calcSheet.getCell('E13').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7030A0' } };
  calcSheet.mergeCells('E13:H13');

  // F14 = Top Reduction (T if OVERLAY, 0 if INSET)
  calcSheet.getCell('E14').value = 'Top Reduction';
  calcSheet.getCell('F14').value = { formula: 'IF(F9="OVERLAY",B15,0)' };
  calcSheet.getCell('F14').numFmt = '0.0';
  calcSheet.getCell('F14').style = calcStyle;
  calcSheet.getCell('G14').value = 'mm';
  calcSheet.getCell('H14').value = '= T if OVERLAY, 0 if INSET';

  // F15 = Bottom Reduction
  calcSheet.getCell('E15').value = 'Bottom Reduction';
  calcSheet.getCell('F15').value = { formula: 'IF(F10="OVERLAY",B15,0)' };
  calcSheet.getCell('F15').numFmt = '0.0';
  calcSheet.getCell('F15').style = calcStyle;
  calcSheet.getCell('G15').value = 'mm';
  calcSheet.getCell('H15').value = '= T if OVERLAY, 0 if INSET';

  // ============================================
  // PANEL CALCULATIONS (Fully Linked)
  // ============================================
  calcSheet.getCell('A17').value = 'PANEL CALCULATIONS (All formulas linked to inputs above)';
  calcSheet.getCell('A17').font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
  calcSheet.getCell('A17').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2E75B6' } };
  calcSheet.mergeCells('A17:H17');

  // Headers
  const headerRow = 18;
  const headers = ['Panel', 'Finish W', 'Finish H', 'Cut W', 'Cut H', 'Area (m²)', 'Edge (m)', 'Formula Reference'];
  headers.forEach((h, i) => {
    const cell = calcSheet.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4472C4' } };
    cell.alignment = { horizontal: 'center' };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  });

  // Row 19: Left Side
  let row = 19;
  calcSheet.getCell(row, 1).value = 'Left Side';
  calcSheet.getCell(row, 1).font = { bold: true };
  // Finish W = D (depth)
  calcSheet.getCell(row, 2).value = { formula: '$B$6' };
  calcSheet.getCell(row, 2).numFmt = '0.0';
  // Finish H = H - TopReduction - BottomReduction
  calcSheet.getCell(row, 3).value = { formula: '$B$5-$F$14-$F$15' };
  calcSheet.getCell(row, 3).numFmt = '0.0';
  // Cut W = Finish W - ET(front) - ET(back) = Finish W - 2*ET
  calcSheet.getCell(row, 4).value = { formula: 'B19-($F$6*2)' };
  calcSheet.getCell(row, 4).numFmt = '0.0';
  // Cut H = Finish H - TopEdge - BottomEdge (edges only if INSET)
  calcSheet.getCell(row, 5).value = { formula: 'C19-IF($F$9="INSET",$F$6,0)-IF($F$10="INSET",$F$6,0)' };
  calcSheet.getCell(row, 5).numFmt = '0.0';
  // Area = Finish W × Finish H × 2 / 1000000
  calcSheet.getCell(row, 6).value = { formula: 'B19*C19*2/1000000' };
  calcSheet.getCell(row, 6).numFmt = '0.000';
  // Edge = Front + Back + Top(if INSET) + Bottom(if INSET)
  calcSheet.getCell(row, 7).value = { formula: '(C19*2+IF($F$9="INSET",B19,0)+IF($F$10="INSET",B19,0))/1000' };
  calcSheet.getCell(row, 7).numFmt = '0.00';
  calcSheet.getCell(row, 8).value = 'W=D, H=H-Reductions';

  // Row 20: Right Side (same as Left)
  row = 20;
  calcSheet.getCell(row, 1).value = 'Right Side';
  calcSheet.getCell(row, 1).font = { bold: true };
  calcSheet.getCell(row, 2).value = { formula: '$B$6' };
  calcSheet.getCell(row, 2).numFmt = '0.0';
  calcSheet.getCell(row, 3).value = { formula: '$B$5-$F$14-$F$15' };
  calcSheet.getCell(row, 3).numFmt = '0.0';
  calcSheet.getCell(row, 4).value = { formula: 'B20-($F$6*2)' };
  calcSheet.getCell(row, 4).numFmt = '0.0';
  calcSheet.getCell(row, 5).value = { formula: 'C20-IF($F$9="INSET",$F$6,0)-IF($F$10="INSET",$F$6,0)' };
  calcSheet.getCell(row, 5).numFmt = '0.0';
  calcSheet.getCell(row, 6).value = { formula: 'B20*C20*2/1000000' };
  calcSheet.getCell(row, 6).numFmt = '0.000';
  calcSheet.getCell(row, 7).value = { formula: '(C20*2+IF($F$9="INSET",B20,0)+IF($F$10="INSET",B20,0))/1000' };
  calcSheet.getCell(row, 7).numFmt = '0.00';
  calcSheet.getCell(row, 8).value = 'เหมือน Left Side';

  // Row 21: Top Panel
  row = 21;
  calcSheet.getCell(row, 1).value = 'Top Panel';
  calcSheet.getCell(row, 1).font = { bold: true };
  // Finish W = W - 2*T (if INSET) or W (if OVERLAY)
  calcSheet.getCell(row, 2).value = { formula: 'IF($F$9="INSET",$B$4-(2*$B$15),$B$4)' };
  calcSheet.getCell(row, 2).numFmt = '0.0';
  // Finish H = D (depth)
  calcSheet.getCell(row, 3).value = { formula: '$B$6' };
  calcSheet.getCell(row, 3).numFmt = '0.0';
  // Cut W = Finish W - 2*ET
  calcSheet.getCell(row, 4).value = { formula: 'B21-($F$6*2)' };
  calcSheet.getCell(row, 4).numFmt = '0.0';
  // Cut H = Finish H - 2*ET
  calcSheet.getCell(row, 5).value = { formula: 'C21-($F$6*2)' };
  calcSheet.getCell(row, 5).numFmt = '0.0';
  // Area
  calcSheet.getCell(row, 6).value = { formula: 'B21*C21*2/1000000' };
  calcSheet.getCell(row, 6).numFmt = '0.000';
  // Edge = all 4 edges
  calcSheet.getCell(row, 7).value = { formula: '(B21*2+C21*2)/1000' };
  calcSheet.getCell(row, 7).numFmt = '0.00';
  calcSheet.getCell(row, 8).value = 'INSET: W-2T, OVERLAY: W';

  // Row 22: Bottom Panel
  row = 22;
  calcSheet.getCell(row, 1).value = 'Bottom Panel';
  calcSheet.getCell(row, 1).font = { bold: true };
  // Finish W = W - 2*T (if INSET) or W (if OVERLAY)
  calcSheet.getCell(row, 2).value = { formula: 'IF($F$10="INSET",$B$4-(2*$B$15),$B$4)' };
  calcSheet.getCell(row, 2).numFmt = '0.0';
  // Finish H = D
  calcSheet.getCell(row, 3).value = { formula: '$B$6' };
  calcSheet.getCell(row, 3).numFmt = '0.0';
  // Cut W = Finish W - 2*ET
  calcSheet.getCell(row, 4).value = { formula: 'B22-($F$6*2)' };
  calcSheet.getCell(row, 4).numFmt = '0.0';
  // Cut H = Finish H - 2*ET
  calcSheet.getCell(row, 5).value = { formula: 'C22-($F$6*2)' };
  calcSheet.getCell(row, 5).numFmt = '0.0';
  // Area
  calcSheet.getCell(row, 6).value = { formula: 'B22*C22*2/1000000' };
  calcSheet.getCell(row, 6).numFmt = '0.000';
  // Edge
  calcSheet.getCell(row, 7).value = { formula: '(B22*2+C22*2)/1000' };
  calcSheet.getCell(row, 7).numFmt = '0.00';
  calcSheet.getCell(row, 8).value = 'INSET: W-2T, OVERLAY: W';

  // Row 23: Back Panel
  row = 23;
  calcSheet.getCell(row, 1).value = 'Back Panel';
  calcSheet.getCell(row, 1).font = { bold: true };
  // Finish W = (W - 2*T) + 2*Groove - Clearance
  calcSheet.getCell(row, 2).value = { formula: '($B$4-(2*$B$15))+(2*$B$9)-$B$10' };
  calcSheet.getCell(row, 2).numFmt = '0.0';
  // Finish H = (H - 2*T) + 2*Groove - Clearance
  calcSheet.getCell(row, 3).value = { formula: '($B$5-(2*$B$15))+(2*$B$9)-$B$10' };
  calcSheet.getCell(row, 3).numFmt = '0.0';
  // Cut W = Finish W (no edge)
  calcSheet.getCell(row, 4).value = { formula: 'B23' };
  calcSheet.getCell(row, 4).numFmt = '0.0';
  // Cut H = Finish H (no edge)
  calcSheet.getCell(row, 5).value = { formula: 'C23' };
  calcSheet.getCell(row, 5).numFmt = '0.0';
  // Area (single face for back)
  calcSheet.getCell(row, 6).value = { formula: 'B23*C23/1000000' };
  calcSheet.getCell(row, 6).numFmt = '0.000';
  // Edge = 0
  calcSheet.getCell(row, 7).value = 0;
  calcSheet.getCell(row, 7).numFmt = '0.00';
  calcSheet.getCell(row, 8).value = '(W-2T)+2G-C, ไม่มี edge';

  // Apply borders to all panel rows
  for (let r = 19; r <= 23; r++) {
    for (let col = 1; col <= 8; col++) {
      calcSheet.getCell(r, col).border = {
        top: {style:'thin'}, left: {style:'thin'},
        bottom: {style:'thin'}, right: {style:'thin'}
      };
    }
  }

  // Row 24: Totals
  row = 24;
  calcSheet.getCell(row, 1).value = 'TOTAL';
  calcSheet.getCell(row, 1).font = { bold: true };
  calcSheet.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9EAD3' } };
  calcSheet.getCell(row, 6).value = { formula: 'SUM(F19:F23)' };
  calcSheet.getCell(row, 6).numFmt = '0.000';
  calcSheet.getCell(row, 6).font = { bold: true };
  calcSheet.getCell(row, 6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9EAD3' } };
  calcSheet.getCell(row, 7).value = { formula: 'SUM(G19:G23)' };
  calcSheet.getCell(row, 7).numFmt = '0.00';
  calcSheet.getCell(row, 7).font = { bold: true };
  calcSheet.getCell(row, 7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9EAD3' } };
  calcSheet.getCell(row, 8).value = '5 แผ่น';

  // ============================================
  // FORMULA REFERENCE SECTION
  // ============================================
  const refRow = 27;
  calcSheet.getCell(`A${refRow}`).value = 'FORMULA REFERENCE (ตรงกับโปรแกรมจริง)';
  calcSheet.getCell(`A${refRow}`).font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
  calcSheet.getCell(`A${refRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7030A0' } };
  calcSheet.mergeCells(`A${refRow}:H${refRow}`);

  const formulas = [
    ['T_real', '= F4 + (F5 × 2)', 'ความหนาจริงหลังติด laminate'],
    ['T_joint', '= T_real (B14)', 'ใช้ T_real สำหรับ Joint calculation'],
    ['Side Finish H', '= B5 - F14 - F15', 'OVERLAY: H - 2×T_real'],
    ['Top/Bottom Finish W', '= INSET: B4 - 2×T_real', 'INSET: กินพื้นที่ตาม T_real'],
    ['Cut Size', '= Finish - (ET × 2)', 'ไม่มี Pre-milling ในสูตร'],
    ['Back Panel W', '= (B4-2×T_real) + 2×Groove - Clear', 'เข้าร่อง groove'],
    ['Surface Area', '= Finish W × Finish H × 2 / 1,000,000', 'm² (2 หน้า)'],
    ['Edge Length', '= Sum of edged sides / 1,000', 'm'],
  ];

  formulas.forEach((f, i) => {
    const r = refRow + 1 + i;
    calcSheet.getCell(r, 1).value = f[0];
    calcSheet.getCell(r, 1).font = { bold: true };
    calcSheet.getCell(r, 2).value = f[1];
    calcSheet.mergeCells(`B${r}:E${r}`);
    calcSheet.getCell(r, 6).value = f[2];
    calcSheet.mergeCells(`F${r}:H${r}`);
  });

  // ============================================
  // INPUT CELL MAPPING SECTION
  // ============================================
  const mapRow = refRow + formulas.length + 2;
  calcSheet.getCell(`A${mapRow}`).value = 'INPUT CELL MAPPING (เปลี่ยนค่าที่ไหน → อะไรเปลี่ยน)';
  calcSheet.getCell(`A${mapRow}`).font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
  calcSheet.getCell(`A${mapRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'C65911' } };
  calcSheet.mergeCells(`A${mapRow}:H${mapRow}`);

  const mapping = [
    ['B4 (Width W)', '→ Top/Bottom Finish W, Back Panel W'],
    ['B5 (Height H)', '→ Side Finish H, Back Panel H'],
    ['B6 (Depth D)', '→ Side Finish W, Top/Bottom Finish H'],
    ['F4 (Core T)', '→ T_real → T_joint → Joint reductions → Panel sizes'],
    ['F5 (Surface)', '→ T_real → T_joint → INSET: Top/Bottom W, OVERLAY: Side H'],
    ['F6 (Edge ET)', '→ Cut W, Cut H ทุก panel (ยกเว้น Back)'],
    ['F9 (Top Joint)', '→ Side H (OVERLAY), Top W (INSET), Side edge count'],
    ['F10 (Bottom Joint)', '→ Side H (OVERLAY), Bottom W (INSET), Side edge count'],
    ['B9 (Groove)', '→ Back Panel W, H'],
    ['B10 (Clearance)', '→ Back Panel W, H'],
  ];

  mapping.forEach((m, i) => {
    const r = mapRow + 1 + i;
    calcSheet.getCell(r, 1).value = m[0];
    calcSheet.getCell(r, 1).font = { bold: true };
    calcSheet.getCell(r, 2).value = m[1];
    calcSheet.mergeCells(`B${r}:H${r}`);
  });

  // ============================================
  // SHEET 2: Material Stack Diagram
  // ============================================
  const stackSheet = workbook.addWorksheet('Material Stack', {
    properties: { tabColor: { argb: '70AD47' } }
  });

  stackSheet.columns = [
    { width: 5 },
    { width: 25 },
    { width: 20 },
    { width: 45 },
  ];

  stackSheet.mergeCells('A1:D1');
  stackSheet.getCell('A1').value = 'Material Stack Structure (Panel Cross-Section)';
  stackSheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFF' } };
  stackSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '70AD47' } };
  stackSheet.getRow(1).height = 30;

  const stackData = [
    ['', 'Layer', 'Thickness', 'Description'],
    ['', '═══════════════════════', '════════════', '══════════════════════════════════'],
    ['', 'Surface A (Top Face)', '= F5 mm', 'HPL / Melamine / Veneer'],
    ['', '───────────────────────', '', ''],
    ['', 'CORE', '= F4 mm', 'Particle Board / MDF / HMR / Plywood'],
    ['', '───────────────────────', '', ''],
    ['', 'Surface B (Bottom Face)', '= F5 mm', 'HPL / Melamine / Veneer'],
    ['', '═══════════════════════', '════════════', '══════════════════════════════════'],
    ['', 'TOTAL (T_real)', '= B14 mm', '= F4 + (F5 × 2)'],
    ['', '', '', ''],
    ['', 'EDGE BAND (on edges)', '= F6 mm', 'PVC / ABS - ไม่รวมในความหนา T_real'],
  ];

  stackData.forEach((row, i) => {
    row.forEach((cell, j) => {
      stackSheet.getCell(i + 3, j + 1).value = cell;
      if (i === 0) {
        stackSheet.getCell(i + 3, j + 1).font = { bold: true };
        stackSheet.getCell(i + 3, j + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9EAD3' } };
      }
    });
  });

  stackSheet.getCell('A16').value = 'IMPORTANT NOTES:';
  stackSheet.getCell('A16').font = { bold: true, size: 12 };
  stackSheet.mergeCells('A16:D16');

  const notes = [
    '1. T_real = Core + Surface×2 (ความหนาจริงของแผ่นหลังติด laminate)',
    '2. T_nominal = Core only (ใช้คำนวณ Joint - INSET/OVERLAY)',
    '3. Cut Size = Finish Size - Edge Thickness (ไม่มี Pre-milling)',
    '4. Pre-milling (0.5mm/side) เป็นขั้นตอนเครื่องจักร ไม่บวกในสูตร',
    '5. Edge Band ติดที่ขอบ ไม่เพิ่มความหนาแผ่น',
    '6. Surface ไม่กระทบขนาด Panel (ติดบนหน้า ไม่เพิ่มกว้าง/ยาว)',
  ];

  notes.forEach((note, i) => {
    stackSheet.getCell(`A${17 + i}`).value = note;
    stackSheet.mergeCells(`A${17 + i}:D${17 + i}`);
  });

  // ============================================
  // SHEET 3: Joint Types Comparison
  // ============================================
  const jointSheet = workbook.addWorksheet('Joint Types', {
    properties: { tabColor: { argb: 'ED7D31' } }
  });

  jointSheet.columns = [
    { width: 5 },
    { width: 35 },
    { width: 35 },
  ];

  jointSheet.mergeCells('A1:C1');
  jointSheet.getCell('A1').value = 'Cabinet Joint Types: INSET vs OVERLAY';
  jointSheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFF' } };
  jointSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ED7D31' } };
  jointSheet.getRow(1).height = 30;

  const jointData = [
    ['', 'INSET Joint', 'OVERLAY Joint'],
    ['', '', ''],
    ['Diagram', '    ┌────────────┐', '┌────────────────┐'],
    ['', '    │ Top Panel │', '│   Top Panel    │'],
    ['', '┌───┼────────────┼───┐', '├────────────────┤'],
    ['', '│   │            │   │', '│ │            │ │'],
    ['', '│ S │  Cabinet   │ S │', '│ S│  Cabinet  │S │'],
    ['', '│ i │  Interior  │ i │', '│ i│  Interior │i │'],
    ['', '│ d │            │ d │', '│ d│            │d │'],
    ['', '│ e │            │ e │', '│ e│            │e │'],
    ['', '└───┼────────────┼───┘', '├────────────────┤'],
    ['', '    │Bottom Panel│', '│  Bottom Panel  │'],
    ['', '    └────────────┘', '└────────────────┘'],
    ['', '', ''],
    ['Description', 'Top/Bottom fit BETWEEN sides', 'Top/Bottom sit ON sides'],
    ['Side Height', 'H (full height)', 'H - T_top - T_bottom'],
    ['Top/Bottom W', 'W - 2×T (narrower)', 'W (full width)'],
    ['Side Edges', '4 edges (all sides)', '2-4 edges (front/back always)'],
    ['Strength', 'Better load distribution', 'Simpler construction'],
    ['Use Case', 'Heavy-duty cabinets', 'Standard cabinets'],
  ];

  jointData.forEach((row, i) => {
    row.forEach((cell, j) => {
      jointSheet.getCell(i + 3, j + 1).value = cell;
      if (i === 0 || j === 0) {
        jointSheet.getCell(i + 3, j + 1).font = { bold: true };
      }
      if (i === 0) {
        jointSheet.getCell(i + 3, j + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FCE4D6' } };
      }
    });
  });

  // ============================================
  // Save workbook
  // ============================================
  const outputPath = path.join(__dirname, '..', 'cabinet-calculator.xlsx');
  await workbook.xlsx.writeFile(outputPath);

  console.log(`\n✅ Excel file generated successfully!`);
  console.log(`📁 Output: ${outputPath}`);
  console.log(`\n📋 Sheets created:`);
  console.log(`   1. Panel Calculator - Fully linked formulas`);
  console.log(`   2. Material Stack - Cross-section diagram`);
  console.log(`   3. Joint Types - INSET vs OVERLAY comparison`);
  console.log(`\n🔗 All cells are linked:`);
  console.log(`   - Change W, H, D → Panel sizes update`);
  console.log(`   - Change Core T → Joint calculations update`);
  console.log(`   - Change Surface → T_real updates`);
  console.log(`   - Change Edge ET → Cut sizes update`);
  console.log(`   - Change Joint type → Side height & Top/Bottom width update`);
}

generateCalculator().catch(console.error);
