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
const logoPath = path.join(__dirname, 'prapa.png'); // ประกาศตัวแปรโลโก้ด้านบนสุด
const logoPath1 = path.join(__dirname, 'prapa02.png'); // PDF
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
    query = `SELECT * FROM VW_Yearly WHERE Year_ = ${year} ORDER BY Month_`;
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

 // ===== ใส่โลโก้ที่มุมซ้ายบน =====
  if (fs.existsSync(logoPath)) {
    let logoWidth = 110, logoHeight = 100;
    if (type === 'daily') {
      logoWidth = 95; logoHeight = 75;
    } else if (type === 'monthly') {
      logoWidth = 95; logoHeight = 75;
    } else if (type === 'yearly') {
      logoWidth = 95; logoHeight = 75; // เพิ่มขนาดโลโก้สำหรับรายปี
    }
    const imageId = workbook.addImage({
      filename: logoPath,
      extension: 'png',
    });
    sheet.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: logoWidth, height: logoHeight }
    });
  }

  // ===== เพิ่มหัวข้อใหญ่ (Title) =====
  const title = 'รายงานข้อมูลระบบจ่ายคลอรีนอัตโนมัติ สถานีสูบจ่ายประปามีนบุรี';
  sheet.mergeCells('A1:J1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { name: 'Calibri', size: 16, bold: true };
  sheet.getRow(1).height = 28;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  // ขยายขนาด Title (หัวข้อใหญ่) เพิ่มขึ้น
  titleCell.font = { name: 'Calibri', size: 16, bold: true }; // 12 → 16 และ bold
  sheet.getRow(1).height = 65; // 22 → 28
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
  if (type === 'daily') {
    headers = [
      'ลำดับ',
      'วันที่',
      'เวลา',
      'ปริมาณคลอรีนขาเข้าสถานี (mg/l)',
      'ปริมาณคลอรีนขาออกสถานี (mg/l)',
      'อัตราการไหลน้ำขาเข้า (m3/h)',
      'อัตราการจ่ายคลอรีนรวม (l/h)',
      'ระดับคลอรีนในถังเก็บ (m)',
      'ปริมาณคลอรีนในถังเก็บ (Litr)',
      'ปริมาณการใช้คลอรีน รายชั่วโมง (Litr)'
    ];
    columnWidths = [15, 15, 14, 13, 13, 13, 11, 13, 17,13];
  } else if(type === 'monthly') {
    headers = [
      'ลำดับ',
      'วันที่',
      'ปริมาณคลอรีนขาเข้าสถานี (mg/l)',
      'ปริมาณคลอรีนขาออกสถานี (mg/l)',
      'อัตราการไหลน้ำขาเข้า (m3/h)',
      'อัตราการจ่ายคลอรีนรวม (l/h)',
      'ระดับคลอรีนในถังเก็บ (m)',
      'ปริมาณคลอรีนในถังเก็บ (Litr)',
      'ปริมาณการใช้คลอรีน รายวัน (Litr)'
    ];
    columnWidths = [15, 14, 14, 13, 13, 13, 13, 14, 13];
  }

  else  {
    headers = [
      'ลำดับ',
      'เดือน',
      'ปี',
      'ปริมาณคลอรีนขาเข้าสถานี (mg/l)',
      'ปริมาณคลอรีนขาออกสถานี (mg/l)',
      'อัตราการไหลน้ำขาเข้า (m3/h)',
      'อัตราการจ่ายคลอรีนรวม (l/h)',
      'ระดับคลอรีนในถังเก็บ (m)',
      'ปริมาณคลอรีนในถังเก็บ (Litr)',
      'ปริมาณการใช้คลอรีน รายเดือน (Litr)'
    ];
    columnWidths = [15, 7, 14, 14, 13, 13, 13, 14, 17, 11];
  }
  sheet.addRow(headers);

  // กำหนดความกว้างคอลัมน์
  columnWidths.forEach((w, i) => {
    sheet.getColumn(i + 2).width = w;
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

    if (type === 'yearly') {
  /*const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];*/
  values = [
    i + 1,
    /*thaiMonths[(row.Month_ || 1) - 1] ?? '-',
    '-',*/ // ไม่มีเวลาใน yearly
    row.Month_?.toFixed(0) ?? '-',
    row.Year_?.toFixed(0) ?? '-',
    row.Chlorine_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.Chlorine_Outlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.Flow_Water_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.Total_Flow_Chlorine?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.Level_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.Volume_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.Chlorine_Per_Month?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-'
  ];
}

    else if (type === 'monthly') {
      values = [
        i + 1,
        new Date(row.Date_Stamp).toLocaleDateString('th-TH'),
        row.Chlorine_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
        row.Chlorine_Outlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
        row.Flow_Water_Inlet?.toLocaleString() ?? '-',
        row.Total_Flow_Chlorine?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
        row.Level_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
        row.Volume_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
        row.Chlorine_Per_Day?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-'
      ];
    } else if (type === 'daily'){
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
        row.Chlorine_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
        row.Chlorine_Outlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
        row.Flow_Water_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
        row.Total_Flow_Chlorine?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
        row.Level_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
        row.Volume_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
        row.Chlorine_Per_Hour?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-'
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
    { label: 'ปริมาณคลอรีนขาเข้าสถานี (mg/l)', key: 'Chlorine_Inlet' },
    { label: 'ปริมาณคลอรีนขาออกสถานี (mg/l))', key: 'Chlorine_Outlet' },
    { label: 'อัตราการไหลของน้ำขาเข้า (m³)', key: 'Flow_Water_Inlet' },
    { label: 'อัตราการจ่ายคลอรีนรวม (l/h)', key: 'Total_Flow_Chlorine' }
    /*{ label: 'ระดับคลอรีนในถัง (m)', key: 'Level_Chlorine_Tank' },
    { label: 'ปริมาณคลอรีนในถัง (Litr)', key: 'Volume_Chlorine_Tank' }*/
  ];
  const summaryLabels = ['สูงสุด', 'ต่ำสุด', 'เฉลี่ย'/*, 'ผลรวม'*/];
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
  /*sheet.mergeCells(`I${startSummaryRow}:J${startSummaryRow}`);
  sheet.getCell(`I${startSummaryRow}`).value = 'ผลรวม';
  sheet.getCell(`I${startSummaryRow}`).font = { name: 'Calibri', size: 8, bold: false };
  sheet.getCell(`I${startSummaryRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getCell(`I${startSummaryRow}`).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB7FFD6' }
  };*/

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
    sheet.getCell(`C${rowIdx}`).value = max === 0 ? '' : (typeof max === 'number' ? max.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-'.replace(/\.?0+$/, '') : '');
    sheet.getCell(`C${rowIdx}`).font = { name: 'Calibri', size: 8, bold: false };
    sheet.getCell(`C${rowIdx}`).alignment = { horizontal: 'left', vertical: 'middle' };

    // Merge E:F สำหรับ "ต่ำสุด"
    sheet.mergeCells(`E${rowIdx}:F${rowIdx}`);
    let min = arr.length ? Math.min(...arr) : '';
    sheet.getCell(`E${rowIdx}`).value = min === 0 ? '' : (typeof min === 'number' ? min.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-'.replace(/\.?0+$/, '') : '');
    sheet.getCell(`E${rowIdx}`).font = { name: 'Calibri', size: 8, bold: false };
    sheet.getCell(`E${rowIdx}`).alignment = { horizontal: 'left', vertical: 'middle' };

    // Merge G:H สำหรับ "เฉลี่ย"
    sheet.mergeCells(`G${rowIdx}:H${rowIdx}`);
    let avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : '';
    sheet.getCell(`G${rowIdx}`).value = avg === 0 ? '' : (typeof avg === 'number' ? avg.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-'.replace(/\.?0+$/, '') : '');
    sheet.getCell(`G${rowIdx}`).font = { name: 'Calibri', size: 8, bold: false };
    sheet.getCell(`G${rowIdx}`).alignment = { horizontal: 'left', vertical: 'middle' };

    // Merge I:J สำหรับ "ผลรวม"
    /*sheet.mergeCells(`I${rowIdx}:J${rowIdx}`);
    let sum = arr.length ? arr.reduce((a, b) => a + b, 0) : '';
    sheet.getCell(`I${rowIdx}`).value = sum === 0 ? '' : (typeof sum === 'number' ? sum.toFixed(3).replace(/\.?0+$/, '') : '');
    sheet.getCell(`I${rowIdx}`).font = { name: 'Calibri', size: 8, bold: false };
    sheet.getCell(`I${rowIdx}`).alignment = { horizontal: 'left', vertical: 'middle' };*/

    // ความสูงแถว summary
    sheet.getRow(rowIdx).height = 13; // 9 → 13

  });

  // ===== ตารางสรุปเฉพาะผลรวม =====
let extraSummaryKeys = [];
if (type === 'daily') {
  extraSummaryKeys = [
    { label: 'ปริมาณการใช้คลอรีนรวม รายวัน', key: 'Chlorine_Per_Hour' },
    { label: 'อัตราการไหลน้ำขาเข้ารวมทั้งวัน', key: 'Flow_Water_Inlet' },
  ];
} else if (type === 'monthly') {
  extraSummaryKeys = [
    { label: 'ปริมาณการใช้คลอรีนรวม รายเดือน', key: 'Chlorine_Per_Day' },
    { label: 'อัตราการไหลน้ำขาเข้ารวมทั้งเดือน', key: 'Flow_Water_Inlet' },
  ];
} else if (type === 'yearly') {
  extraSummaryKeys = [
    { label: 'ปริมาณการใช้คลอรีนรวม รายปี', key: 'Chlorine_Per_Month' },
    { label: 'อัตราการไหลน้ำขาเข้ารวมทั้งปี', key: 'Flow_Water_Inlet' },
  ];
}

// ===== วาดหัวตารางแบบ 2 คอลัมน์ =====
const extraStartRow = sheet.lastRow.number + 2;
sheet.getCell(`A${extraStartRow}`).value = 'รายการ';
sheet.getCell(`B${extraStartRow}`).value = 'ผลรวม (Litr)';
['A', 'B'].forEach(col => {
  const cell = sheet.getCell(`${col}${extraStartRow}`);
  cell.font = { name: 'Calibri', size: 10, bold: true };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEAB7' } // สีเหลืองอ่อน
  };
  cell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  };
});

// ===== วาดข้อมูลในตาราง =====
extraSummaryKeys.forEach((item, i) => {
  const rowIdx = extraStartRow + 1 + i;
  const sum = data.map(row => Number(row[item.key]) || 0).reduce((a, b) => a + b, 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-';

  sheet.getCell(`A${rowIdx}`).value = item.label;
  sheet.getCell(`A${rowIdx}`).font = { name: 'Calibri', size: 9 };
  sheet.getCell(`A${rowIdx}`).alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.getCell(`A${rowIdx}`).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  };

  sheet.getCell(`B${rowIdx}`).value = sum === '0.00' ? '' : sum;
  sheet.getCell(`B${rowIdx}`).font = { name: 'Calibri', size: 9 };
  sheet.getCell(`B${rowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
  sheet.getCell(`B${rowIdx}`).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  };

  sheet.getRow(rowIdx).height = 13;
});

// ปรับความกว้างคอลัมน์ A และ B ให้เหมาะกับข้อความ
sheet.getColumn('A').width = 22;
sheet.getColumn('B').width = 13;


  // ===== ส่งไฟล์ =====
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=ChlorineMinburiReport.xlsx');
  await workbook.xlsx.write(res);
  res.end();
});



// -------------------- [4] EXPORT PDF --------------------
app.post('/export/pdf', async (req, res) => {
  // --- [4.1] เตรียม PDF ---
  const data = req.body.data;
  const PDFDocument = require('pdfkit');
  const filename = `ChlorineMinburiReport.pdf`; // ใช้ชื่อเดียวกันทั้ง daily/monthly
  const filepath = path.join(__dirname, filename);

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  const stream = fs.createWriteStream(filepath);
  doc.pipe(stream);

  // --- [4.2] ฟอนต์ไทย ---
  doc.registerFont('THSarabun', path.join(__dirname, 'Sarabun-Regular.ttf'));
  doc.registerFont('THSarabun-Bold', path.join(__dirname, 'Sarabun-Bold.ttf'));

  // --- [4.2.1] ประกาศ mainScale ก่อนใช้ ---
  const mainScale = 1 / 1.25;

  // --- ใส่โลโก้ที่มุมซ้ายบน ---
const logoPath1 = path.join(__dirname, 'prapa02.png');
const logoX = doc.page.margins.left;  // ซ้ายสุด margin
const logoY = 30; // ระยะห่างจากขอบบน (ปรับได้)
const logoWidth = 50;  // ปรับขนาดโลโก้ให้เหมาะสม
const logoHeight = 50;

if (fs.existsSync(logoPath1)) {
  doc.image(logoPath1, logoX, logoY, { width: logoWidth, height: logoHeight });
}

// --- วาดข้อความรายงาน และวันที่ชิดกับโลโก้ด้านขวา ---
const textX = logoX + logoWidth + 10; // เลื่อนขวาจากโลโก้ 10 หน่วย
const textWidth = doc.page.width - doc.page.margins.right - textX; // กว้างเต็มขวาถึง margin

// ข้อความหัวรายงาน
doc.font('THSarabun-Bold').fontSize(12).fillColor('black')
  .text('รายงานข้อมูลระบบจ่ายคลอรีนอัตโนมัติปลายสาย สถานีสูบจ่ายประปามีนบุรี',
    textX, logoY + 5, { width: textWidth, align: 'left' });

// ข้อความวันที่ (ใช้จากเดิม)
let reportDate = '';
if (data.length > 0 && data[0].Date_Stamp) {
  const d = new Date(data[0].Date_Stamp);
  const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  reportDate = `ณ วันที่ ${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
} else {
  reportDate = 'ณ วันที่ -';
}
doc.font('THSarabun').fontSize(9).fillColor('black')
  .text(reportDate, textX, logoY + 25, { width: textWidth, align: 'left' });

// เลื่อนตำแหน่ง y เพื่อเริ่มวาดหัวตาราง
doc.moveDown(0); // ปรับห่างจาก header ให้พอเหมาะ

  // --- [4.4] กำหนด column และหัวตาราง ---
  const headers = [
    'ลำดับ',
    'วันที่',
    'เวลา',
    'ปริมาณคลอรีนขาเข้าสถานี (mg/l)',
    'ปริมาณคลอรีนขาออกสถานี (mg/l)',
    'อัตราการไหลน้ำ        ขาเข้า       (m3/h)',
    'อัตราการจ่าย    คลอรีนรวม    (l/h)',
    'ระดับคลอรีนในถังเก็บ (m)',
    'ปริมาณคลอรีนใน      ถังเก็บ        (Litr)',
    // 'Totalizer จาก Flow Meter1 (Litr)', // <<== ลบบรรทัดนี้ออก
    'ปริมาณการใช้คลอรีน       รายชั่วโมง       (Litr)'
  ];
  const columnWidths = [11.35, 22.5, 18.75, 30.25, 30.5, 32.75, 30, 30, 35.5, 42.75].map(w => w * 1.3 * 1.5 * mainScale);
  /*const startX = doc.x;
  let y = doc.y + 3.75 * 1.3 * 1.5 * mainScale;*/

  const startX = logoX;                         // เริ่มชิดซ้ายเท่ากับโลโก้
  const startY = logoY + logoHeight + 20;      // เลื่อนลงพ้นโลโก้และข้อความ
  let y = startY;

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
      row.Chlorine_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
      row.Chlorine_Outlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
      row.Flow_Water_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
      row.Total_Flow_Chlorine?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
      row.Level_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
      row.Volume_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
      // row.TOT_Chlorine_Line1?.toFixed(2) ?? '-', // <<== ลบบรรทัดนี้ออก
      row.Chlorine_Per_Hour?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' // ถ้ามี field นี้
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
  const summaryHeaders = ['รายการ', 'สูงสุด', 'ต่ำสุด', 'เฉลี่ย'/*, 'ผลรวม'*/];
  const summaryKeys = [
    { label: 'ปริมาณคลอรีนขาเข้า (mg/l)', key: 'Chlorine_Inlet' },
    { label: 'ปริมาณคลอรีนขาออก (mg/l)', key: 'Chlorine_Outlet' },
    { label: 'อัตราการไหลของน้ำขาเข้า (m³)', key: 'Flow_Water_Inlet' },
    { label: 'อัตราการจ่ายคลอรีนรวม (l/h)', key: 'Total_Flow_Chlorine' }
    /*{ label: 'ระดับคลอรีนในถัง (m)', key: 'Level_Chlorine_Tank' },
    { label: 'ปริมาณคลอรีนในถัง (Litr)', key: 'Volume_Chlorine_Tank' }*/
  ];

  const Scale = 1 / 1.25;
  const summaryScale = 3.0;
  const summaryColWidths = [40, 26, 26, 26/*, 26*/].map(w => w * summaryScale * mainScale);
  const summaryRowHeight = 7 * summaryScale * mainScale;
  const summaryFontSize = 9 * mainScale;
  const summaryTableWidth = summaryColWidths.reduce((a, b) => a + b, 0);
  const margin = 30;
  const pageWidth = doc.page.width - margin * 2;

  // ตำแหน่งขวาสุด
  const startXSummary = pageWidth - summaryTableWidth + margin - 20 ; //ขยับซ้าย 
  let ySummary = startY; // ปรับจาก 47 เป็น 46

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
    const max = arr.length ? Math.max(...arr).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '';
    const min = arr.length ? Math.min(...arr).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '';
    const avg = arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '';
    // ผลรวม เฉพาะ Flow_Water_Inlet, Total_Flow_Chlorine (ที่เหลือเว้นว่าง)
    let sum = '';
    if (item.key === 'Flow_Water_Inlet' || item.key === 'Chlorine_Per_Hour') {
      sum = arr.length ? arr.reduce((a, b) => a + b, 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '';
    }
    const rowVals = [item.label, max, min, avg/*, sum*/];
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

  
// ตารางผลรวมเฉพาะ (เว้นบรรทัดลงมา)
ySummary += 25; // หรือ 20 เพื่อให้ห่างชัดเจนจากตารางบน

// 🔸 สรุปผลรวมเฉพาะ (Flow + Chlorine Summary)
const totalOnlyHeaders = ['รายการ', 'ผลรวม (Litr)'];
const totalOnlyKeys = [
  { label: 'ปริมาณการใช้คลอรีนรายวัน', key: 'Chlorine_Per_Hour' }, // 👈 เปลี่ยนตามโหมดที่ใช้
  { label: 'อัตราการไหลน้ำขาเข้ารวมทั้งวัน', key: 'Flow_Water_Inlet' }
  
];
const totalColWidths = [150, 120].map(w => w * mainScale);
const totalRowHeight = 18 * mainScale;
const totalFontSize = 10 * mainScale;

// เช็กพื้นที่ก่อนวาด
if (ySummary + (totalRowHeight * (totalOnlyKeys.length + 1)) > doc.page.height - margin) {
  doc.addPage();
  ySummary = margin;
}

// วาดหัวตาราง
let tx = startXSummary;
for (let i = 0; i < totalOnlyHeaders.length; i++) {
  doc.rect(tx, ySummary, totalColWidths[i], totalRowHeight).fillAndStroke('#FFEAB7', 'black');
  doc.font('THSarabun-Bold')
    .fontSize(totalFontSize)
    .fillColor('black')
    .text(totalOnlyHeaders[i], tx, ySummary + (totalRowHeight / 4), {
      width: totalColWidths[i], align: 'center'
    });
  tx += totalColWidths[i];
}
ySummary += totalRowHeight;

// วาดข้อมูล
totalOnlyKeys.forEach(item => {
  tx = startXSummary;
  const sum = data.map(row => Number(row[item.key]) || 0).reduce((a, b) => a + b, 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const rowVals = [item.label, sum];
  for (let i = 0; i < rowVals.length; i++) {
    doc.rect(tx, ySummary, totalColWidths[i], totalRowHeight).stroke();
    doc.font('THSarabun')
      .fontSize(totalFontSize)
      .text(rowVals[i], tx, ySummary + (totalRowHeight - totalFontSize) / 2, {
        width: totalColWidths[i], align: 'center'
      });
    tx += totalColWidths[i];
  }
  ySummary += totalRowHeight;
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
  const filename = `ChlorineMinburiReport.pdf`; // ใช้ชื่อเดียวกันทั้ง daily/monthly
  const filepath = path.join(__dirname, filename);

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  const stream = fs.createWriteStream(filepath);
  doc.pipe(stream);

  // ฟอนต์ไทย
  doc.registerFont('THSarabun', path.join(__dirname, 'Sarabun-Regular.ttf'));
  doc.registerFont('THSarabun-Bold', path.join(__dirname, 'Sarabun-Bold.ttf'));

  // ประกาศ mainScale ตรงนี้
  const mainScale = 1 / 1.25;

  // --- ใส่โลโก้ที่มุมซ้ายบน ---
const logoPath1 = path.join(__dirname, 'prapa02.png');
const logoX = doc.page.margins.left;  // ซ้ายสุด margin
const logoY = 30; // ระยะห่างจากขอบบน (ปรับได้)
const logoWidth = 40;  // ปรับขนาดโลโก้ให้เหมาะสม
const logoHeight = 40;

if (fs.existsSync(logoPath1)) {
  doc.image(logoPath1, logoX, logoY, { width: logoWidth, height: logoHeight });
  doc.moveDown(0);
}

// --- วาดข้อความรายงาน และวันที่ชิดกับโลโก้ด้านขวา ---
const textX = logoX + logoWidth + 10; // เลื่อนขวาจากโลโก้ 10 หน่วย
const textWidth = doc.page.width - doc.page.margins.right - textX; // กว้างเต็มขวาถึง margin

// ข้อความหัวรายงาน
doc.font('THSarabun-Bold').fontSize(12).fillColor('black')
  .text('รายงานข้อมูลระบบจ่ายคลอรีนอัตโนมัติปลายสาย สถานีสูบจ่ายประปามีนบุรี',
    textX, logoY + 5, { width: textWidth, align: 'left' });

// ข้อความวันที่ (ใช้จากเดิม)
let reportDate = '';
if (data.length > 0 && data[0].Date_Stamp) {
  const d = new Date(data[0].Date_Stamp);
  const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  reportDate = `ณ เดือน ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
} else {
  reportDate = 'ณ เดือน -';
}
doc.font('THSarabun').fontSize(9).fillColor('black')
  .text(reportDate, textX, logoY + 25, { width: textWidth, align: 'left' });

// เลื่อนตำแหน่ง y เพื่อเริ่มวาดหัวตาราง
doc.moveDown(0); // ปรับห่างจาก header ให้พอเหมาะ

  // กำหนด column และหัวตารางสำหรับ monthly
  const headers = [
    'ลำดับ',
    'วันที่',
    'ปริมาณคลอรีนขาเข้าสถานี (mg/l)',
    'ปริมาณคลอรีนขาออกสถานี (mg/l)',
    'อัตราการไหลน้ำขาเข้า (m3/h)',
    'อัตราการจ่ายคลอรีนรวม   (l/h)',
    'ระดับคลอรีนในถังเก็บ (m)',
    'ปริมาณคลอรีนในถังเก็บ (Litr)',
    'ปริมาณการใช้คลอรีน รายวัน (Litr)'
  ];
  const columnWidths = [11.35, 22.5, 30.25, 29.5, 32.75, 28, 26, 35, 42.75].map(w => w * 1.3 * 1.5 * mainScale);
  /*const startX = doc.x;
  let y = doc.y + 3.75 * 1.3 * 1.5 * mainScale;*/

  const startX = logoX;                         // เริ่มชิดซ้ายเท่ากับโลโก้
  const startY = logoY + logoHeight + 10;      // เลื่อนลงพ้นโลโก้และข้อความ
  let y = startY;

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
    row.Chlorine_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.Chlorine_Outlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.Flow_Water_Inlet?.toLocaleString() ?? '-',
    row.Total_Flow_Chlorine?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.Level_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.Volume_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.Chlorine_Per_Day?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-'
  ];

  // ความสูงของเซลล์
  const cellHeight = 9.375 * 1.3 * 1.5 * mainScale;
  const fontSize = 3.75 * 1.3 * 1.5 * mainScale;
  const verticalOffset = (cellHeight - fontSize) / 2; // 🔸 ทำให้ text อยู่กลางแนวตั้ง

  for (let i = 0; i < values.length; i++) {
    doc.rect(x, y, columnWidths[i], cellHeight).stroke();

    doc.font('THSarabun')
      .fontSize(fontSize)
      .text(values[i], x, y + verticalOffset, {
        width: columnWidths[i],
        align: 'center'
      });

    x += columnWidths[i];
  }

  y += cellHeight;

  // ตรวจสอบว่าจะขึ้นหน้าใหม่ไหม  ถ้าเป็นหน้าแรก ไม่ให้ขึ้นหน้าใหม่อัตโนมัติ
if (y > doc.page.height - 22.5 * 1.3 * 1.5 * mainScale && doc.page.number > 1) {
  doc.addPage();
  y = 18.75 * 1.3 * 1.5 * mainScale;
}
});

  // --- วาดตารางสรุปแบบละเอียด (Summary Table) ---
  const summaryHeaders = ['รายการ', 'สูงสุด', 'ต่ำสุด', 'เฉลี่ย'/*, 'ผลรวม'*/]; 
  const summaryKeys = [
    { label: 'ปริมาณคลอรีนขาเข้า (mg/l)', key: 'Chlorine_Inlet' },
    { label: 'ปริมาณคลอรีนขาออก (mg/l)', key: 'Chlorine_Outlet' },
    { label: 'อัตราการไหลของน้ำขาเข้า (m³)', key: 'Flow_Water_Inlet' },
    { label: 'อัตราการจ่ายคลอรีนรวม (l/h)', key: 'Total_Flow_Chlorine' }
    /*{ label: 'ระดับคลอรีนในถัง (m)', key: 'Level_Chlorine_Tank' },
    { label: 'ปริมาณคลอรีนในถัง (Litr)', key: 'Volume_Chlorine_Tank' }*/
  ];

  const Scale = 1 / 1.5;
  const summaryScale = 3.0;
  const summaryColWidths = [40, 26, 26, 26/*, 26*/].map(w => w * summaryScale * mainScale);
  const summaryRowHeight = 8 * summaryScale * mainScale;
  const summaryFontSize = 9 * mainScale;
  const summaryTableWidth = summaryColWidths.reduce((a, b) => a + b, 0);
  const margin = 30;
  const pageWidth = doc.page.width - margin * 2;

  // ตำแหน่งขวาสุด
  const startXSummary = pageWidth - summaryTableWidth + margin - 50; //ขยับซ้าย - 50
  let ySummary = startY; // ปรับจาก 47 เป็น 46

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
    const max = arr.length ? Math.max(...arr).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '';
    const min = arr.length ? Math.min(...arr).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '';
    const avg = arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '';
    // ผลรวม เฉพาะ Flow_Water_Inlet, Total_Flow_Chlorine (ที่เหลือเว้นว่าง)
    let sum = '';
    if (item.key === 'Flow_Water_Inlet' || item.key === 'Total_Flow_Chlorine') {
      sum = arr.length ? arr.reduce((a, b) => a + b, 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '';
    }
    const rowVals = [item.label, max, min, avg/*, sum*/];
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

// ตารางผลรวมเฉพาะ (เว้นบรรทัดลงมา)
ySummary += 15; // หรือ 20 เพื่อให้ห่างชัดเจนจากตารางบน

// 🔸 สรุปผลรวมเฉพาะ (Flow + Chlorine Summary)
const totalOnlyHeaders = ['รายการ', 'ผลรวม (Litr)'];
const totalOnlyKeys = [
  { label: 'ปริมาณการใช้คลอรีนรายเดือน', key: 'Chlorine_Per_Day' }, // 👈 เปลี่ยนตามโหมดที่ใช้
  { label: 'อัตราการไหลน้ำขาเข้ารวมทั้งเดือน', key: 'Flow_Water_Inlet' }
  
];
const totalColWidths = [150, 120].map(w => w * mainScale);
const totalRowHeight = 18 * mainScale;
const totalFontSize = 10 * mainScale;

// เช็กพื้นที่ก่อนวาด
if (ySummary + (totalRowHeight * (totalOnlyKeys.length + 1)) > doc.page.height - margin) {
  doc.addPage();
  ySummary = margin;
}

// วาดหัวตาราง
let tx = startXSummary;
for (let i = 0; i < totalOnlyHeaders.length; i++) {
  doc.rect(tx, ySummary, totalColWidths[i], totalRowHeight).fillAndStroke('#FFEAB7', 'black');
  doc.font('THSarabun-Bold')
    .fontSize(totalFontSize)
    .fillColor('black')
    .text(totalOnlyHeaders[i], tx, ySummary + (totalRowHeight / 4), {
      width: totalColWidths[i], align: 'center'
    });
  tx += totalColWidths[i];
}
ySummary += totalRowHeight;

// วาดข้อมูล
totalOnlyKeys.forEach(item => {
  tx = startXSummary;
  const sum = data.map(row => Number(row[item.key]) || 0).reduce((a, b) => a + b, 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const rowVals = [item.label, sum];
  for (let i = 0; i < rowVals.length; i++) {
    doc.rect(tx, ySummary, totalColWidths[i], totalRowHeight).stroke();
    doc.font('THSarabun')
      .fontSize(totalFontSize)
      .text(rowVals[i], tx, ySummary + (totalRowHeight - totalFontSize) / 2, {
        width: totalColWidths[i], align: 'center'
      });
    tx += totalColWidths[i];
  }
  ySummary += totalRowHeight;
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

// -------------------- [4.1] EXPORT PDF Yearly --------------------
app.post('/export/pdf/Yearly', async (req, res) => {
  const data = req.body.data;
  const PDFDocument = require('pdfkit');
  const filename = `ChlorineMinburiReport.pdf`; // ใช้ชื่อเดียวกันทั้ง daily/Yearly
  const filepath = path.join(__dirname, filename);

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  const stream = fs.createWriteStream(filepath);
  doc.pipe(stream);

  // ฟอนต์ไทย
  doc.registerFont('THSarabun', path.join(__dirname, 'Sarabun-Regular.ttf'));
  doc.registerFont('THSarabun-Bold', path.join(__dirname, 'Sarabun-Bold.ttf'));

  // ประกาศ mainScale ตรงนี้
  const mainScale = 1 / 1.25;

  // --- ใส่โลโก้ที่มุมซ้ายบน ---
const logoPath1 = path.join(__dirname, 'prapa02.png');
const logoX = doc.page.margins.left;  // ซ้ายสุด margin
const logoY = 30; // ระยะห่างจากขอบบน (ปรับได้)
const logoWidth = 50;  // ปรับขนาดโลโก้ให้เหมาะสม
const logoHeight = 50;

if (fs.existsSync(logoPath1)) {
  doc.image(logoPath1, logoX, logoY, { width: logoWidth, height: logoHeight });
}

// --- วาดข้อความรายงาน และวันที่ชิดกับโลโก้ด้านขวา ---
const textX = logoX + logoWidth + 10; // เลื่อนขวาจากโลโก้ 10 หน่วย
const textWidth = doc.page.width - doc.page.margins.right - textX; // กว้างเต็มขวาถึง margin

// ข้อความหัวรายงาน
doc.font('THSarabun-Bold').fontSize(12).fillColor('black')
  .text('รายงานข้อมูลระบบจ่ายคลอรีนอัตโนมัติปลายสาย สถานีสูบจ่ายประปามีนบุรี',
    textX, logoY + 5, { width: textWidth, align: 'left' });

// ข้อความวันที่ (ใช้จากเดิม)
let reportDate = '';
if (data.length > 0 && data[0].Year_) {
  reportDate = `ณ ปี ${data[0].Year_ + 543}`; // ✅ แสดงปี พ.ศ.
} else {
  reportDate = 'ณ ปี -';
}
doc.font('THSarabun').fontSize(9).fillColor('black')
  .text(reportDate, textX, logoY + 25, { width: textWidth, align: 'left' });

// เลื่อนตำแหน่ง y เพื่อเริ่มวาดหัวตาราง
doc.moveDown(0); // ปรับห่างจาก header ให้พอเหมาะ

  // กำหนด column และหัวตารางสำหรับ Yearly
const headers = [
      'ลำดับ',
      'เดือน',
      'ปี',
      'ปริมาณคลอรีนขาเข้าสถานี (mg/l)',
      'ปริมาณคลอรีนขาออกสถานี (mg/l)',
      'อัตราการไหลน้ำขาเข้า (m3/h)',
      'อัตราการจ่ายคลอรีนรวม   (l/h)',
      'ระดับคลอรีนในถังเก็บ (m)',
      'ปริมาณคลอรีนในถังเก็บ (Litr)',
      'ปริมาณการใช้คลอรีน รายเดือน (Litr)'
];
  const columnWidths = [11.35, 11.35, 22.5, 29.35, 29, 32.75, 28, 26, 34.5, 42.75].map(w => w * 1.3 * 1.5 * mainScale);
  /*const startX = doc.x;
  let y = doc.y + 3.75 * 1.3 * 1.5 * mainScale;*/

  const startX = logoX;                         // เริ่มชิดซ้ายเท่ากับโลโก้
  const startY = logoY + logoHeight + 10;      // เลื่อนลงพ้นโลโก้และข้อความ
  let y = startY;

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
      /*new Date(row.Date_Stamp).toLocaleDateString('th-TH'),*/
      row.Month_?.toFixed(0) ?? '-',
      row.Year_?.toFixed(0) ?? '-',
      row.Chlorine_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.Chlorine_Outlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.Flow_Water_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.Total_Flow_Chlorine?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.Level_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.Volume_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.Chlorine_Per_Month?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-'
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
  const summaryHeaders = ['รายการ', 'สูงสุด', 'ต่ำสุด', 'เฉลี่ย'/*, 'ผลรวม'*/]; 
  const summaryKeys = [
    { label: 'ปริมาณคลอรีนขาเข้า (mg/l)', key: 'Chlorine_Inlet' },
    { label: 'ปริมาณคลอรีนขาออก (mg/l)', key: 'Chlorine_Outlet' },
    { label: 'อัตราการไหลของน้ำขาเข้า (m³)', key: 'Flow_Water_Inlet' },
    { label: 'อัตราการจ่ายคลอรีนรวม (l/h)', key: 'Total_Flow_Chlorine' }
    /*{ label: 'ระดับคลอรีนในถัง (m)', key: 'Level_Chlorine_Tank' },
    { label: 'ปริมาณคลอรีนในถัง (Litr)', key: 'Volume_Chlorine_Tank' }*/
  ];

  const summaryScale = 3.0;
  const summaryColWidths = [40, 26, 26, 26/*, 26*/].map(w => w * summaryScale * mainScale);
  const summaryRowHeight = 8 * summaryScale * mainScale;
  const summaryFontSize = 9 * mainScale;
  const summaryTableWidth = summaryColWidths.reduce((a, b) => a + b, 0);
  const margin = 30;
  const pageWidth = doc.page.width - margin * 2;

  // ตำแหน่งขวาสุด
  const startXSummary = pageWidth - summaryTableWidth + margin - 50; //ขยับซ้าย
  let ySummary = startY; // ปรับจาก 47 เป็น 46

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
    const max = arr.length ? Math.max(...arr).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '';
    const min = arr.length ? Math.min(...arr).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '';
    const avg = arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '';
    // ผลรวม เฉพาะ Flow_Water_Inlet, Total_Flow_Chlorine (ที่เหลือเว้นว่าง)
    let sum = '';
    if (item.key === 'Flow_Water_Inlet' || item.key === 'Total_Flow_Chlorine') {
      sum = arr.length ? arr.reduce((a, b) => a + b, 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '';
    }
    const rowVals = [item.label, max, min, avg/*, sum*/];
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

// ตารางผลรวมเฉพาะ (เว้นบรรทัดลงมา)
ySummary += 15; // หรือ 20 เพื่อให้ห่างชัดเจนจากตารางบน

// 🔸 สรุปผลรวมเฉพาะ (Flow + Chlorine Summary)
const totalOnlyHeaders = ['รายการ', 'ผลรวม (Litr)'];
const totalOnlyKeys = [
  { label: 'ปริมาณการใช้คลอรีนรายปี', key: 'Chlorine_Per_Month' }, // 👈 เปลี่ยนตามโหมดที่ใช้
  { label: 'อัตราการไหลน้ำขาเข้ารวมทั้งปี', key: 'Flow_Water_Inlet' }
  
];
const totalColWidths = [150, 120].map(w => w * mainScale);
const totalRowHeight = 18 * mainScale;
const totalFontSize = 10 * mainScale;

// เช็กพื้นที่ก่อนวาด
if (ySummary + (totalRowHeight * (totalOnlyKeys.length + 1)) > doc.page.height - margin) {
  doc.addPage();
  ySummary = margin;
}

// วาดหัวตาราง
let tx = startXSummary;
for (let i = 0; i < totalOnlyHeaders.length; i++) {
  doc.rect(tx, ySummary, totalColWidths[i], totalRowHeight).fillAndStroke('#FFEAB7', 'black');
  doc.font('THSarabun-Bold')
    .fontSize(totalFontSize)
    .fillColor('black')
    .text(totalOnlyHeaders[i], tx, ySummary + (totalRowHeight / 4), {
      width: totalColWidths[i], align: 'center'
    });
  tx += totalColWidths[i];
}
ySummary += totalRowHeight;

// วาดข้อมูล
totalOnlyKeys.forEach(item => {
  tx = startXSummary;
  const sum = data.map(row => Number(row[item.key]) || 0).reduce((a, b) => a + b, 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const rowVals = [item.label, sum];
  for (let i = 0; i < rowVals.length; i++) {
    doc.rect(tx, ySummary, totalColWidths[i], totalRowHeight).stroke();
    doc.font('THSarabun')
      .fontSize(totalFontSize)
      .text(rowVals[i], tx, ySummary + (totalRowHeight - totalFontSize) / 2, {
        width: totalColWidths[i], align: 'center'
      });
    tx += totalColWidths[i];
  }
  ySummary += totalRowHeight;
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
// -------------------- [5] START SERVER --------------------
app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});