// -------------------- [1] IMPORT & CONFIG --------------------
const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');

const app = express(); // <-- ประกาศตัวแปร app ก่อน

const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../Frontend')));

const config = {
  user: 'sa',
  password: '12345',
  server: 'localhost',
  database: 'Minburi_Chlorine',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    instanceName: 'SQLEXPRESS'
  }
};

// ฟังก์ชันแสดงทศนิยม 3 ตำแหน่ง เฉพาะกรณีที่มีทศนิยม
function formatNumber(val) {
  if (typeof val !== 'number' || isNaN(val)) return '';
  if (Number.isInteger(val)) return val.toString();
  return val.toFixed(3).replace(/\.?0+$/, '');
}

// -------------------- [2] API: GET DATA --------------------
app.get('/ChlorineReport', async (req, res) => {
  const { date, type } = req.query;
  if (!date || !type) return res.status(400).send('Missing parameters');

  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;

  let query = '';
  if (type === 'daily') {
    query = `SELECT * FROM VW_Daily WHERE CAST(Date_Stamp AS DATE) = '${date}' ORDER BY Time_Stamp`;
  } else if (type === 'monthly') {
    query = `SELECT * FROM VW_Monthly WHERE YEAR(Date_Stamp) = ${year} AND MONTH(Date_Stamp) = ${month} ORDER BY Date_Stamp`;
  } else if (type === 'yearly') {
    query = `SELECT * FROM VW_Monthly WHERE YEAR(Date_Stamp) = ${year} ORDER BY Date_Stamp`;
  } else {
    return res.status(400).send('Invalid report type');
  }

  try {
    await sql.connect(config);
    const result = await sql.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).send('Database error');
  }
});

// -------------------- [3] EXPORT EXCEL --------------------
app.post('/export/excel', async (req, res) => {
  const data = req.body.data || [];
  const type = req.body.type || 'daily'; // <<== เพิ่มตรงนี้
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Chlorine Report');

  // ===== เพิ่มหัวข้อใหญ่ (Title) =====
  const title = 'รายงานข้อมูลระบบจ่ายคลอรีนอัตโนมัติ สถานีสูบจ่ายประปามีนบุรี';
  sheet.mergeCells('A1:J1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = title;
  // ขยายขนาด Title (หัวข้อใหญ่) เพิ่มขึ้น
  titleCell.font = { name: 'Calibri', size: 16, bold: true }; // 12 → 16 และ bold
  sheet.getRow(1).height = 28; // 22 → 28
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB7E1FF' }
  };

  // ===== เพิ่มวันที่ของข้อมูล (A2) =====
  let reportDate = '-';
  if (data.length > 0 && data[0].Date_Stamp) {
    const d = new Date(data[0].Date_Stamp);
    const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    reportDate = `วันที่ข้อมูล: ${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
  }
  sheet.mergeCells('A2:J2');
  sheet.getCell('A2').value = reportDate;
  sheet.getCell('A2').font = { name: 'Calibri', size: 11, bold: false }; // 8 → 11
  sheet.getCell('A2').alignment = { horizontal: 'left', vertical: 'middle' };

  // ===== เพิ่มวันที่ส่งออก (A3) =====
  const now = new Date();
  const exportDate = `วันที่ส่งออก: ${now.toLocaleDateString('th-TH')} เวลา: ${now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;
  sheet.mergeCells('A3:J3');
  sheet.getCell('A3').value = exportDate;
  sheet.getCell('A3').font = { name: 'Calibri', size: 9, bold: false }; // 6.4 → 9
  sheet.getCell('A3').alignment = { horizontal: 'left', vertical: 'middle' };

  // ===== หัวตาราง (แยกตาม type) =====
  let headers, columnWidths;
  if (type === 'monthly') {
    headers = [
      'ลำดับ',
      'วันที่',
      'ปริมาณคลอรีนขาเข้าสถานี (mg/l)',
      'ปริมาณคลอรีนขาออกสถานี (mg/l)',
      'อัตราการไหลน้ำขาเข้า (m3/h)',
      'อัตราการจ่ายคลอรีนรวม (l/h)',
      'ระดับคลอรีนในถังเก็บ (m)',
      'ปริมาณคลอรีนในถังเก็บ (ลิตร)',
      'ปริมาณการใช้คลอรีน รายวัน (ลิตร)'
    ];
    columnWidths = [7, 12, 13, 13, 13, 13, 11, 13, 15];
  } else {
    headers = [
      'ลำดับ',
      'วันที่',
      'เวลา',
      'ปริมาณคลอรีนขาเข้าสถานี (mg/l)',
      'ปริมาณคลอรีนขาออกสถานี (mg/l)',
      'อัตราการไหลน้ำขาเข้า (m3/h)',
      'อัตราการจ่ายคลอรีนรวม (l/h)',
      'ระดับคลอรีนในถังเก็บ (m)',
      'ปริมาณคลอรีนในถังเก็บ (ลิตร)',
      'ปริมาณการใช้คลอรีน รายชั่วโมง (ลิตร)'
    ];
    columnWidths = [7, 12, 9, 13, 13, 13, 13, 11, 13, 15];
  }
  sheet.addRow(headers);

  // กำหนดความกว้างคอลัมน์
  columnWidths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  const headerRow = sheet.getRow(4);
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 5, bold: true }; // 8 → 7 และ bold (ย่อฟอนต์หัวตาราง)
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' }
    };
  });

  // ใส่สีฟ้าให้หัวตารางคอลัมน์ "ลำดับ" (A) และ "วันที่" (B)
  headerRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB7D6FF' }
  };
  headerRow.getCell(2).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB7D6FF' }
  };

  // ===== ปรับความสูงแต่ละแถว (เพิ่มขึ้น) =====
  for (let i = 5; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    row.height = 13; // 7.5 → 13
  }

  // ===== ข้อมูลหลัก (แยกตาม type) =====
  data.forEach((row, i) => {
    let values;
    if (type === 'monthly') {
      values = [
        i + 1,
        new Date(row.Date_Stamp).toLocaleDateString('th-TH'),
        row.Chlorine_Inlet?.toFixed(2) ?? '-',
        row.Chlorine_Outlet?.toFixed(2) ?? '-',
        row.Flow_Water_Inlet?.toLocaleString() ?? '-',
        row.Total_Flow_Chlorine?.toFixed(2) ?? '-',
        row.Level_Chlorine_Tank?.toFixed(2) ?? '-',
        row.Volume_Chlorine_Tank?.toFixed(2) ?? '-',
        row.Usage_Chlorine_Per_Day?.toFixed(2) ?? '-'
      ];
    } else {
      values = [
        i + 1,
        new Date(row.Date_Stamp).toLocaleDateString('th-TH'),
        (() => {
          try {
            if (typeof row.Time_Stamp === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(row.Time_Stamp)) return row.Time_Stamp;
            const match = row.Time_Stamp && row.Time_Stamp.match(/T(\d{2}):(\d{2}):(\d{2})/);
            if (match) return `${match[1]}:${match[2]}`;
            return row.Time_Stamp;
          } catch { return row.Time_Stamp || '-'; }
        })(),
        row.Chlorine_Inlet?.toFixed(2) ?? '-',
        row.Chlorine_Outlet?.toFixed(2) ?? '-',
        row.Flow_Water_Inlet?.toLocaleString() ?? '-',
        row.Total_Flow_Chlorine?.toFixed(2) ?? '-',
        row.Level_Chlorine_Tank?.toFixed(2) ?? '-',
        row.Volume_Chlorine_Tank?.toFixed(2) ?? '-',
        row.Chlorine_Per_Hour?.toFixed(2) ?? '-'
      ];
    }
    const addedRow = sheet.addRow(values);
    addedRow.height = 13;
    addedRow.eachCell(cell => {
      cell.font = { name: 'Calibri', size: 8, bold: false };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
  });

  // ===== ตารางสรุป (ย่อ) =====
  const summaryKeys = [
    { label: 'ปริมาณคลอรีนขาเข้าสถานี', key: 'Chlorine_Inlet' },
    { label: 'ปริมาณคลอรีนขาออกสถานี', key: 'Chlorine_Outlet' },
    { label: 'อัตราการไหลน้ำขาเข้า', key: 'Flow_Water_Inlet' },
    { label: 'อัตราการจ่ายคลอรีนรวม', key: 'Total_Flow_Chlorine' }
  ];
  const summaryLabels = ['สูงสุด', 'ต่ำสุด', 'เฉลี่ย', 'ผลรวม'];
  const startSummaryRow = sheet.lastRow.number + 2;

  // Header summary (ย่อ)
  sheet.mergeCells(`A${startSummaryRow}:B${startSummaryRow}`);
  sheet.getCell(`A${startSummaryRow}`).value = 'รายการ';
  sheet.getCell(`A${startSummaryRow}`).font = { name: 'Calibri', size: 8, bold: false };
  sheet.getCell(`A${startSummaryRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getCell(`A${startSummaryRow}`).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB7FFD6' }
  };
  sheet.mergeCells(`C${startSummaryRow}:D${startSummaryRow}`);
  sheet.getCell(`C${startSummaryRow}`).value = 'สูงสุด';
  sheet.getCell(`C${startSummaryRow}`).font = { name: 'Calibri', size: 8, bold: false };
  sheet.getCell(`C${startSummaryRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getCell(`C${startSummaryRow}`).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB7FFD6' }
  };
  sheet.mergeCells(`E${startSummaryRow}:F${startSummaryRow}`);
  sheet.getCell(`E${startSummaryRow}`).value = 'ต่ำสุด';
  sheet.getCell(`E${startSummaryRow}`).font = { name: 'Calibri', size: 8, bold: false };
  sheet.getCell(`E${startSummaryRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getCell(`E${startSummaryRow}`).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB7FFD6' }
  };
  sheet.mergeCells(`G${startSummaryRow}:H${startSummaryRow}`);
  sheet.getCell(`G${startSummaryRow}`).value = 'เฉลี่ย';
  sheet.getCell(`G${startSummaryRow}`).font = { name: 'Calibri', size: 8, bold: false };
  sheet.getCell(`G${startSummaryRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getCell(`G${startSummaryRow}`).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB7FFD6' }
  };
  sheet.mergeCells(`I${startSummaryRow}:J${startSummaryRow}`);
  sheet.getCell(`I${startSummaryRow}`).value = 'ผลรวม';
  sheet.getCell(`I${startSummaryRow}`).font = { name: 'Calibri', size: 8, bold: false };
  sheet.getCell(`I${startSummaryRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getCell(`I${startSummaryRow}`).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB7FFD6' }
  };

  // ===== ข้อมูล summary (ย่อ) =====
  summaryKeys.forEach((item, i) => {
    const arr = data.map(row => Number(row[item.key]) || 0);
    const rowIdx = startSummaryRow + 1 + i;
    // Merge A:B สำหรับชื่อรายการ
    sheet.mergeCells(`A${rowIdx}:B${rowIdx}`);
    sheet.getCell(`A${rowIdx}`).value = item.label;
    sheet.getCell(`A${rowIdx}`).font = { name: 'Calibri', size: 8, bold: false }; // 5.5 → 8
    sheet.getCell(`A${rowIdx}`).alignment = { horizontal: 'left', vertical: 'middle' };

    // Merge C:D สำหรับ "สูงสุด"
    sheet.mergeCells(`C${rowIdx}:D${rowIdx}`);
    let max = arr.length ? Math.max(...arr) : '';
    sheet.getCell(`C${rowIdx}`).value = max === 0 ? '' : (typeof max === 'number' ? max.toFixed(3).replace(/\.?0+$/, '') : '');
    sheet.getCell(`C${rowIdx}`).font = { name: 'Calibri', size: 8, bold: false };
    sheet.getCell(`C${rowIdx}`).alignment = { horizontal: 'left', vertical: 'middle' };

    // Merge E:F สำหรับ "ต่ำสุด"
    sheet.mergeCells(`E${rowIdx}:F${rowIdx}`);
    let min = arr.length ? Math.min(...arr) : '';
    sheet.getCell(`E${rowIdx}`).value = min === 0 ? '' : (typeof min === 'number' ? min.toFixed(3).replace(/\.?0+$/, '') : '');
    sheet.getCell(`E${rowIdx}`).font = { name: 'Calibri', size: 8, bold: false };
    sheet.getCell(`E${rowIdx}`).alignment = { horizontal: 'left', vertical: 'middle' };

    // Merge G:H สำหรับ "เฉลี่ย"
    sheet.mergeCells(`G${rowIdx}:H${rowIdx}`);
    let avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : '';
    sheet.getCell(`G${rowIdx}`).value = avg === 0 ? '' : (typeof avg === 'number' ? avg.toFixed(3).replace(/\.?0+$/, '') : '');
    sheet.getCell(`G${rowIdx}`).font = { name: 'Calibri', size: 8, bold: false };
    sheet.getCell(`G${rowIdx}`).alignment = { horizontal: 'left', vertical: 'middle' };

    // Merge I:J สำหรับ "ผลรวม"
    sheet.mergeCells(`I${rowIdx}:J${rowIdx}`);
    let sum = arr.length ? arr.reduce((a, b) => a + b, 0) : '';
    sheet.getCell(`I${rowIdx}`).value = sum === 0 ? '' : (typeof sum === 'number' ? sum.toFixed(3).replace(/\.?0+$/, '') : '');
    sheet.getCell(`I${rowIdx}`).font = { name: 'Calibri', size: 8, bold: false };
    sheet.getCell(`I${rowIdx}`).alignment = { horizontal: 'left', vertical: 'middle' };

    // ความสูงแถว summary
    sheet.getRow(rowIdx).height = 13; // 9 → 13
  });

  // ===== ส่งไฟล์ =====
  let excelFilename = 'ChlorineMinburiReport.xlsx';
  if (type === 'monthly') {
    excelFilename = 'ChlorineMinburi Report Monthly.xlsx';
  } else if (type === 'daily') {
    excelFilename = 'ChlorineMinburi Report Daily.xlsx';
  } else if (type === 'yearly') {
    excelFilename = 'ChlorineMinburi Report Yearly.xlsx';
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${excelFilename}`);
  await workbook.xlsx.write(res);
  res.end();
});



// -------------------- [4] EXPORT PDF --------------------
app.post('/export/pdf', async (req, res) => {
  // --- [4.1] เตรียม PDF ---
  const data = req.body.data;
  const PDFDocument = require('pdfkit');
  const type = req.body.type || 'daily'; // เพิ่มรับ type จาก client
  let filename = 'ChlorineMinburiReport.pdf';
  if (type === 'monthly') {
    filename = 'ChlorineMinburi Report Monthly.pdf';
  } else if (type === 'daily') {
    filename = 'ChlorineMinburi Report Daily.pdf';
  } else if (type === 'yearly') {
    filename = 'ChlorineMinburi Report Yearly.pdf';
  }
  const filepath = path.join(__dirname, filename);

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  const stream = fs.createWriteStream(filepath);
  doc.pipe(stream);

  // --- [4.2] ฟอนต์ไทย ---
  doc.registerFont('THSarabun', path.join(__dirname, 'Sarabun-Regular.ttf'));
  doc.registerFont('THSarabun-Bold', path.join(__dirname, 'Sarabun-Bold.ttf'));

  // --- [4.2.1] ประกาศ mainScale ก่อนใช้ ---
  const mainScale = 1 / 1.25;

  // --- [4.3] หัวรายงาน & วันที่ ---
  doc.font('THSarabun-Bold').fontSize(10).text(
    'รายงานข้อมูลระบบจ่ายคลอรีนอัตโนมัติปลายสาย สถานีสูบจ่ายประปามีนบุรี',
    { align: 'center' }
  );
  // ใช้วันที่จากข้อมูลแถวแรก
  let reportDate = '';
  if (data.length > 0 && data[0].Date_Stamp) {
    const d = new Date(data[0].Date_Stamp);
    const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    reportDate = `ณ วันที่ ${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
  } else {
    reportDate = 'ณ วันที่ -';
  }
  doc.moveDown().font('THSarabun').fontSize(7).text(reportDate, { align: 'center' });
  doc.moveDown(0.25);

  // --- [4.4] กำหนด column และหัวตาราง ---
  const headers = [
    'ลำดับ',
    'วันที่',
    'เวลา',
    'ปริมาณคลอรีนขาเข้าสถานี (mg/l)',
    'ปริมาณคลอรีนขาออกสถานี (mg/l)',
    'อัตราการไหลน้ำ        ขาเข้า       (m3/h)',
    'อัตราการจ่าย     คลอรีนรวม (l/h)',
    'ระดับคลอรีนในถังเก็บ (m)',
    'ปริมาณคลอรีนใน      ถังเก็บ      (ลิตร)',
    // 'Totalizer จาก Flow Meter1 (ลิตร)', // <<== ลบบรรทัดนี้ออก
    'ปริมาณการใช้คลอรีน       รายชั่วโมง       (ลิตร)'
  ];
  const columnWidths = [11.25, 22.5, 18.75, 29.25, 28.5, 32.75, 28, 25, 34.5, 42.75].map(w => w * 1.3 * 1.5 * mainScale);
  const startX = doc.x;
  let y = doc.y + 3.75 * 1.3 * 1.5 * mainScale;

  let x = startX;
  const headerBgColor = '#B7D6FF';

  // --- [4.5] วาดหัวตารางบรรทัดเดียว (หัวข้อ+หน่วยรวมกัน) ---
  const headerHeight = 21 * 1.3 * 1.5 * mainScale; // เพิ่มความสูงจาก 19 → 20
  for (let i = 0; i < headers.length; i++) {
    doc.rect(x, y, columnWidths[i], headerHeight).fillAndStroke(headerBgColor, 'black');
    doc.font('THSarabun-Bold').fontSize(9 * mainScale).fillColor('black').text(
      headers[i], x, y + 5, { width: columnWidths[i], align: 'center' }
    );
    x += columnWidths[i];
  }
  y += headerHeight;

  // --- [4.6] วาดข้อมูลในตาราง ---
  data.forEach((row, index) => {
    x = startX;
    const values = [
      index + 1,
      new Date(row.Date_Stamp).toLocaleDateString('th-TH'),
      (() => {
        try {
          if (typeof row.Time_Stamp === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(row.Time_Stamp)) return row.Time_Stamp;
          const match = row.Time_Stamp.match(/T(\d{2}):(\d{2}):(\d{2})/);
          if (match) return `${match[1]}:${match[2]}`;
          return row.Time_Stamp;
        } catch { return row.Time_Stamp || '-'; }
      })(),
      row.Chlorine_Inlet?.toFixed(2) ?? '-',
      row.Chlorine_Outlet?.toFixed(2) ?? '-',
      row.Flow_Water_Inlet?.toLocaleString() ?? '-',
      row.Total_Flow_Chlorine?.toFixed(2) ?? '-',
      row.Level_Chlorine_Tank?.toFixed(2) ?? '-',
      row.Volume_Chlorine_Tank?.toFixed(2) ?? '-',
      // row.TOT_Chlorine_Line1?.toFixed(2) ?? '-', // <<== ลบบรรทัดนี้ออก
      row.Chlorine_Per_Hour?.toFixed(2) ?? '-' // ถ้ามี field นี้
    ];
    for (let i = 0; i < values.length; i++) {
      doc.rect(x, y, columnWidths[i], 9.375 * 1.3 * 1.5 * mainScale).stroke();
      doc.font('THSarabun').fontSize(3.75 * 1.3 * 1.5 * mainScale).text(values[i], x, y + 2 * 1.3 * 1.5 * mainScale, {
        width: columnWidths[i],
        align: 'center'
      });
      x += columnWidths[i];
    }
    y += 9.375 * 1.3 * 1.5 * mainScale;
    if (y > doc.page.height - 22.5 * 1.3 * 1.5 * mainScale) {
      doc.addPage();
      y = 18.75 * 1.3 * 1.5 * mainScale;
    }
  });
  // --- [4.7] คำนวณ summary ---
  // (ลบส่วนคำนวณ summary และวาด summary ออกทั้งหมด)
  // *** ลบตั้งแต่ const getMax ... ถึงจบ forEach วาด summary ***


  // --- [4.5.1] วาดตารางสรุปแบบละเอียด (Summary Table) ---
  const summaryHeaders = ['รายการ', 'สูงสุด', 'ต่ำสุด', 'เฉลี่ย', 'ผลรวม'];
  const summaryKeys = [
    { label: 'ปริมาณคลอรีนขาเข้าสถานี', key: 'Chlorine_Inlet' },
    { label: 'ปริมาณคลอรีนขาออกสถานี', key: 'Chlorine_Outlet' },
    { label: 'อัตราการไหลน้ำขาเข้า', key: 'Flow_Water_Inlet' },
    { label: 'อัตราการจ่ายคลอรีนรวม', key: 'Total_Flow_Chlorine' },
    { label: 'ระดับคลอรีนในถังเก็บ', key: 'Level_Chlorine_Tank' },
    { label: 'ปริมาณคลอรีนในถังเก็บ', key: 'Volume_Chlorine_Tank' }
  ];

  const Scale = 1 / 1.25;
  const summaryScale = 2.8;
  const summaryColWidths = [36, 26, 26, 26, 26].map(w => w * summaryScale * mainScale);
  const summaryRowHeight = 13 * summaryScale * mainScale;
  const summaryFontSize = 9 * mainScale;
  const summaryTableWidth = summaryColWidths.reduce((a, b) => a + b, 0);
  const margin = 30;
  const pageWidth = doc.page.width - margin * 2;

  // ตำแหน่งขวาสุด
  const startXSummary = pageWidth - summaryTableWidth + margin;
  let ySummary = margin + 46; // ปรับจาก 47 เป็น 46

  // วาดหัว summary
  let sx = startXSummary;
  for (let i = 0; i < summaryHeaders.length; i++) {
    doc.rect(sx, ySummary, summaryColWidths[i], summaryRowHeight)
      .fillAndStroke('#B7FFD6', 'black');
    doc.font('THSarabun-Bold').fontSize(summaryFontSize).fillColor('black').text(
      summaryHeaders[i], sx, ySummary + 3, {
        width: summaryColWidths[i], align: 'center'
      }
    );
    sx += summaryColWidths[i];
  }
  ySummary += summaryRowHeight;

  // วาดข้อมูล summary
  summaryKeys.forEach(item => {
    sx = startXSummary;
    const arr = data.map(row => Number(row[item.key]) || 0);
    const max = arr.length ? Math.max(...arr).toFixed(2) : '';
    const min = arr.length ? Math.min(...arr).toFixed(2) : '';
    const avg = arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : '';
    // ผลรวม เฉพาะ Flow_Water_Inlet, Total_Flow_Chlorine (ที่เหลือเว้นว่าง)
    let sum = '';
    if (item.key === 'Flow_Water_Inlet' || item.key === 'Total_Flow_Chlorine') {
      sum = arr.length ? arr.reduce((a, b) => a + b, 0).toFixed(2) : '';
    }
    const rowVals = [item.label, max, min, avg, sum];
    for (let i = 0; i < rowVals.length; i++) {
      doc.rect(sx, ySummary, summaryColWidths[i], summaryRowHeight).stroke();
      doc.font('THSarabun').fontSize(summaryFontSize).fillColor('black').text(
        rowVals[i], sx, ySummary + 3, {
          width: summaryColWidths[i], align: 'center'
        }
      );
      sx += summaryColWidths[i];
    }
    ySummary += summaryRowHeight;
  });

  // --- [4.10] END PDF & RESPONSE ---
  doc.end();

  stream.on('finish', () => {
    res.download(filepath, filename, () => {
      fs.unlink(filepath, () => {});
    });
  });

  stream.on('error', (err) => {
    console.error('PDF stream error:', err);
    res.status(500).send('PDF export error');
  });
});

// -------------------- [4.1] EXPORT PDF MONTHLY --------------------
app.post('/export/pdf/monthly', async (req, res) => {
  const data = req.body.data;
  const PDFDocument = require('pdfkit');
  const filename = `ChlorineMinburi Report Monthly.pdf`; // เปลี่ยนชื่อไฟล์ตรงนี้
  const filepath = path.join(__dirname, filename);

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  const stream = fs.createWriteStream(filepath);
  doc.pipe(stream);

  // ฟอนต์ไทย
  doc.registerFont('THSarabun', path.join(__dirname, 'Sarabun-Regular.ttf'));
  doc.registerFont('THSarabun-Bold', path.join(__dirname, 'Sarabun-Bold.ttf'));

  // ประกาศ mainScale ตรงนี้
  const mainScale = 1 / 1.25;

  // หัวรายงาน & วันที่
  doc.font('THSarabun-Bold').fontSize(10).text(
    'รายงานข้อมูลระบบจ่ายคลอรีนอัตโนมัติปลายสาย สถานีสูบจ่ายประปามีนบุรี (รายเดือน)',
    { align: 'center' }
  );
  let reportDate = '';
  if (data.length > 0 && data[0].Date_Stamp) {
    const d = new Date(data[0].Date_Stamp);
    const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    reportDate = `ณ เดือน ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
  } else {
    reportDate = 'ณ เดือน -';
  }
  doc.moveDown().font('THSarabun').fontSize(7).text(reportDate, { align: 'center' });
  doc.moveDown(0.25);

  // กำหนด column และหัวตารางสำหรับ monthly
  const headers = [
    'ลำดับ',
    'วันที่',
    'ปริมาณคลอรีนขาเข้าสถานี (mg/l)',
    'ปริมาณคลอรีนขาออกสถานี (mg/l)',
    'อัตราการไหลน้ำขาเข้า (m3/h)',
    'อัตราการจ่ายคลอรีนรวม (l/h)',
    'ระดับคลอรีนในถังเก็บ (m)',
    'ปริมาณคลอรีนในถังเก็บ (ลิตร)',
    'ปริมาณการใช้คลอรีน รายวัน (ลิตร)'
  ];
  const columnWidths = [11.25, 22.5, 29.25, 28.5, 32.75, 28, 25, 34.5, 42.75].map(w => w * 1.3 * 1.5 * mainScale);
  const startX = doc.x;
  let y = doc.y + 3.75 * 1.3 * 1.5 * mainScale;

  let x = startX;
  const headerBgColor = '#B7D6FF';

  // วาดหัวตาราง
  const headerHeight = 21 * 1.3 * 1.5 * mainScale;
  for (let i = 0; i < headers.length; i++) {
    doc.rect(x, y, columnWidths[i], headerHeight).fillAndStroke(headerBgColor, 'black');
    doc.font('THSarabun-Bold').fontSize(9 * mainScale).fillColor('black').text(
      headers[i], x, y + 5, { width: columnWidths[i], align: 'center' }
    );
    x += columnWidths[i];
  }
  y += headerHeight;

  // วาดข้อมูลในตาราง
  data.forEach((row, index) => {
    x = startX;
    const values = [
      index + 1,
      new Date(row.Date_Stamp).toLocaleDateString('th-TH'),
      row.Chlorine_Inlet?.toFixed(2) ?? '-',
      row.Chlorine_Outlet?.toFixed(2) ?? '-',
      row.Flow_Water_Inlet?.toLocaleString() ?? '-',
      row.Total_Flow_Chlorine?.toFixed(2) ?? '-',
      row.Level_Chlorine_Tank?.toFixed(2) ?? '-',
      row.Volume_Chlorine_Tank?.toFixed(2) ?? '-',
      row.Usage_Chlorine_Per_Day?.toFixed(2) ?? '-'
    ];
    for (let i = 0; i < values.length; i++) {
      doc.rect(x, y, columnWidths[i], 9.375 * 1.3 * 1.5 * mainScale).stroke();
      doc.font('THSarabun').fontSize(3.75 * 1.3 * 1.5 * mainScale).text(values[i], x, y + 2 * 1.3 * 1.5 * mainScale, {
        width: columnWidths[i],
        align: 'center'
      });
      x += columnWidths[i];
    }
    y += 9.375 * 1.3 * 1.5 * mainScale;
    if (y > doc.page.height - 22.5 * 1.3 * 1.5 * mainScale) {
      doc.addPage();
      y = 18.75 * 1.3 * 1.5 * mainScale;
    }
  });

  // --- วาดตารางสรุปแบบละเอียด (Summary Table) ---
  const summaryHeaders = ['รายการ', 'สูงสุด', 'ต่ำสุด', 'เฉลี่ย', 'ผลรวม']; 
  const summaryKeys = [
    { label: 'ปริมาณคลอรีนขาเข้าสถานี', key: 'Chlorine_Inlet' },
    { label: 'ปริมาณคลอรีนขาออกสถานี', key: 'Chlorine_Outlet' },
    { label: 'อัตราการไหลน้ำขาเข้า', key: 'Flow_Water_Inlet' },
    { label: 'อัตราการจ่ายคลอรีนรวม', key: 'Total_Flow_Chlorine' },
    { label: 'ระดับคลอรีนในถังเก็บ', key: 'Level_Chlorine_Tank' },
    { label: 'ปริมาณคลอรีนในถังเก็บ', key: 'Volume_Chlorine_Tank' }
  ];

  const summaryScale = 2.8;
  const summaryColWidths = [36, 26, 26, 26, 26].map(w => w * summaryScale * mainScale);
  const summaryRowHeight = 13 * summaryScale * mainScale;
  const summaryFontSize = 9 * mainScale;
  const summaryTableWidth = summaryColWidths.reduce((a, b) => a + b, 0);
  const margin = 30;
  const pageWidth = doc.page.width - margin * 2;

  // ตำแหน่งขวาสุด
  const startXSummary = pageWidth - summaryTableWidth + margin;
  let ySummary = margin + 46; // ปรับจาก 47 เป็น 46

  // วาดหัว summary
  let sx = startXSummary;
  for (let i = 0; i < summaryHeaders.length; i++) {
    doc.rect(sx, ySummary, summaryColWidths[i], summaryRowHeight)
      .fillAndStroke('#B7FFD6', 'black');
    doc.font('THSarabun-Bold').fontSize(summaryFontSize).fillColor('black').text(
      summaryHeaders[i], sx, ySummary + 3, {
        width: summaryColWidths[i], align: 'center'
      }
    );
    sx += summaryColWidths[i];
  }
  ySummary += summaryRowHeight;

  // วาดข้อมูล summary
  summaryKeys.forEach(item => {
    sx = startXSummary;
    const arr = data.map(row => Number(row[item.key]) || 0);
    const max = arr.length ? Math.max(...arr).toFixed(2) : '';
    const min = arr.length ? Math.min(...arr).toFixed(2) : '';
    const avg = arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : '';
    // ผลรวม เฉพาะ Flow_Water_Inlet, Total_Flow_Chlorine (ที่เหลือเว้นว่าง)
    let sum = '';
    if (item.key === 'Flow_Water_Inlet' || item.key === 'Total_Flow_Chlorine') {
      sum = arr.length ? arr.reduce((a, b) => a + b, 0).toFixed(2) : '';
    }
    const rowVals = [item.label, max, min, avg, sum];
    for (let i = 0; i < rowVals.length; i++) {
      doc.rect(sx, ySummary, summaryColWidths[i], summaryRowHeight).stroke();
      doc.font('THSarabun').fontSize(summaryFontSize).fillColor('black').text(
        rowVals[i], sx, ySummary + 3, {
          width: summaryColWidths[i], align: 'center'
        }
      );
      sx += summaryColWidths[i];
    }
    ySummary += summaryRowHeight;
  });

  // --- END PDF & RESPONSE ---
  doc.end();

  stream.on('finish', () => {
    res.download(filepath, filename, () => {
      fs.unlink(filepath, () => {});
    });
  });

  stream.on('error', (err) => {
    console.error('PDF stream error:', err);
    res.status(500).send('PDF export error');
  });
});

// -------------------- [LOGIN API] --------------------
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    await sql.connect(config);
    // ตรวจสอบว่ามี username นี้ใน table หรือไม่
    const userResult = await sql.query`
      SELECT * FROM Login WHERE username = ${username}
    `;
    if (userResult.recordset.length === 0) {
      return res.json({ success: false, message: 'ไม่พบชื่อผู้ใช้' });
    }
    // ตรวจสอบรหัสผ่าน
    const passResult = await sql.query`
      SELECT * FROM Login WHERE username = ${username} AND password = ${password}
    `;
    if (passResult.recordset.length === 0) {
      return res.json({ success: false, message: 'รหัสผ่านผิด' });
    }
    // login สำเร็จ
    res.json({ success: true });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.get('/', (req, res) => {
  res.redirect('/login.html');
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

function exportExcel() {
  // สมมติว่ามีตัวแปร dataArray และ type ที่เลือกจาก dropdown
  fetch('/export/excel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: dataArray, type: selectedType }) // selectedType = 'monthly', 'daily', 'yearly'
  })
  .then(res => res.blob())
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.click(); // ไม่ต้องตั้งชื่อไฟล์ใน a.download
    window.URL.revokeObjectURL(url);
  });
}

