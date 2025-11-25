// -------------------- [1] IMPORT & CONFIG --------------------
const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const path = require('path');
const ExcelJS = require('exceljs'); // Updated ExcelJS import
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
  database: 'MB_Chlorine_Database',
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
    return val.toFixed(3).replace(/\.?0+$/, ''); // Ensure proper formatting
}

// -------------------- [2] API: GET DATA --------------------
app.get('/ChlorineReport', async (req, res) => {
  const { date, type, endDate } = req.query;
  console.log('Request params:', { date, type, endDate }); // Debug log
  
  if (!date || !type) return res.status(400).send('Missing parameters');

  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;

  let query = '';
  if (type === 'daily') {
    query = `SELECT * FROM VW_Daily WHERE CAST(Date_Stamp AS DATE) = '${date}' ORDER BY Time_Stamp`;
  } else if (type === 'monthly') {
    query = `SELECT * FROM VW_Monthly WHERE YEAR(Date_Stamp) = ${year} AND MONTH(Date_Stamp) = ${month} ORDER BY Date_Stamp`;
  } else if (type === 'queryMonthly') {
    if (!endDate) {
      console.log('Error: Missing endDate parameter for queryMonthly type');
      return res.status(400).send('Missing endDate parameter for queryMonthly type');
    }
    const startD = new Date(date);
    const endD = new Date(endDate);
    const startYear = startD.getFullYear();
    const startMonth = startD.getMonth() + 1;
    const endYear = endD.getFullYear();
    const endMonth = endD.getMonth() + 1;
    
    console.log('Query range:', { startYear, startMonth, endYear, endMonth }); // Debug log
    
    // Query to get all months between start and end
    query = `SELECT * FROM VW_Monthly 
             WHERE (YEAR(Date_Stamp) > ${startYear} OR (YEAR(Date_Stamp) = ${startYear} AND MONTH(Date_Stamp) >= ${startMonth}))
             AND (YEAR(Date_Stamp) < ${endYear} OR (YEAR(Date_Stamp) = ${endYear} AND MONTH(Date_Stamp) <= ${endMonth}))
             ORDER BY Date_Stamp ASC`;
  } else if (type === 'yearly') {
    query = `SELECT * FROM VW_Yearly WHERE Year_ = ${year} ORDER BY Month_`;
  } else if (type === 'queryYearly') {
    if (!endDate) {
      console.log('Error: Missing endDate parameter for queryYearly type');
      return res.status(400).send('Missing endDate parameter for queryYearly type');
    }
    const startYear = parseInt(date);
    const endYear = parseInt(endDate);
    
    console.log('Query year range:', { startYear, endYear }); // Debug log
    
    // Query to get all years between start and end
    query = `SELECT * FROM VW_Yearly 
             WHERE Year_ >= ${startYear} AND Year_ <= ${endYear}
             ORDER BY Year_ ASC, Month_ ASC`;
  } else if (type === 'query') {
    if (!endDate) {
      console.log('Error: Missing endDate parameter for query type');
      return res.status(400).send('Missing endDate parameter for query type');
    }
    query = `SELECT * FROM VW_Daily WHERE CAST(Date_Stamp AS DATE) BETWEEN '${date}' AND '${endDate}' ORDER BY CAST(Date_Stamp AS DATE) ASC, Time_Stamp ASC`;
  } else {
    console.log('Error: Invalid report type:', type);
    return res.status(400).send('Invalid report type');
  }
  
  console.log('Generated query:', query); // Debug log

    try {
    await sql.connect(config);
    const result = await sql.query(query);
    console.log('Query successful, rows:', result.recordset.length); // Debug log
    // If requesting queryYearly, convert Year_ to พ.ศ. for display on the web UI
    if (type === 'queryYearly' && Array.isArray(result.recordset)) {
      const converted = result.recordset.map(r => {
        const copy = Object.assign({}, r);
        if (copy.Year_ !== undefined && copy.Year_ !== null && !isNaN(copy.Year_)) {
          copy.Year_ = Number(copy.Year_) + 543;
        }
        return copy;
      });
      return res.json(converted);
    }
    res.json(result.recordset);
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).send('Database error');
  }
});

// -------------------- [3] EXPORT EXCEL --------------------
app.post('/export/excel', async (req, res) => {
  const data = req.body.data || [];
  const type = req.body.type || 'daily';
  
  // แยกการ export ระหว่าง Query modes กับ Normal modes
  if (type === 'query' || type === 'queryMonthly' || type === 'queryYearly') {
    return exportExcelQuery(req, res, data, type);
  } else {
    return exportExcelNormal(req, res, data, type);
  }
});

// ========== Export Excel สำหรับ Query Modes (มีตารางสรุปก่อน) ==========
async function exportExcelQuery(req, res, data, type) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Chlorine Report');

  // ===== ใส่โลโก้ =====
  if (fs.existsSync(logoPath)) {
    const imageId = workbook.addImage({ filename: logoPath, extension: 'png' });
    sheet.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: 95, height: 75 }
    });
  }

  // ===== Title =====
  const title = 'รายงานข้อมูลระบบจ่ายคลอรีนอัตโนมัติปลายสาย  สถานีสูบจ่ายประปามีนบุรี';
  const mergeCols = (type === 'queryMonthly') ? 'A1:K1' : 'A1:L1';
  sheet.mergeCells(mergeCols);
  const titleCell = sheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { name: 'Calibri', size: 16, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB7E1FF' } };
  sheet.getRow(1).height = 65;

  // ===== Report Date =====
  let reportDate = '-';
  if (data.length > 0) {
    const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    
    if (type === 'query' && data[0].Date_Stamp && data[data.length-1].Date_Stamp) {
      const startD = new Date(data[0].Date_Stamp);
      const endD = new Date(data[data.length-1].Date_Stamp);
      // ถ้าเลือกวันเริ่มต้นและสิ้นสุดเป็นวันเดียวกัน ให้แสดงแค่วันเดียว
      if (startD.toDateString() === endD.toDateString()) {
        reportDate = `รายการข้อมูล: วันที่ ${startD.getDate()} ${thaiMonths[startD.getMonth()]} ${startD.getFullYear() + 543}`;
      } else {
        reportDate = `รายการข้อมูล: วันที่ ${startD.getDate()} ${thaiMonths[startD.getMonth()]} ${startD.getFullYear() + 543} ถึง ${endD.getDate()} ${thaiMonths[endD.getMonth()]} ${endD.getFullYear() + 543}`;
      }
    } else if (type === 'queryMonthly' && data[0].Date_Stamp && data[data.length-1].Date_Stamp) {
      const startD = new Date(data[0].Date_Stamp);
      const endD = new Date(data[data.length-1].Date_Stamp);
      // ถ้าเลือกเดือนเริ่มต้นและสิ้นสุดเป็นเดือนเดียวกัน ให้แสดงแค่เดือนนั้น
      if (startD.getMonth() === endD.getMonth() && startD.getFullYear() === endD.getFullYear()) {
        reportDate = `รายการข้อมูล: เดือน ${thaiMonths[startD.getMonth()]} ${startD.getFullYear() + 543}`;
      } else {
        reportDate = `รายการข้อมูล: เดือน ${thaiMonths[startD.getMonth()]} ${startD.getFullYear() + 543} ถึง ${thaiMonths[endD.getMonth()]} ${endD.getFullYear() + 543}`;
      }
    } else if (type === 'queryYearly' && data[0].Year_) {
      // แปลงปีเป็น พ.ศ. ถ้าจำเป็น (แต่ระวังไม่ให้เพิ่ม 543 ซ้ำถ้าปีเป็น พ.ศ. อยู่แล้ว)
      const startYearRaw = Math.min(...data.map(d => d.Year_));
      const endYearRaw = Math.max(...data.map(d => d.Year_));
      const toBE = (y) => {
        if (y === undefined || y === null || isNaN(y)) return '-';
        const n = Number(y);
        return n >= 2500 ? n : (n + 543);
      };
      const startYearBE = toBE(startYearRaw);
      const endYearBE = toBE(endYearRaw);
      if (startYearRaw === endYearRaw) {
        reportDate = `รายการข้อมูล: พ.ศ. ${startYearBE}`;
      } else {
        reportDate = `รายการข้อมูล: พ.ศ. ${startYearBE} ถึง ${endYearBE}`;
      }
    }
  }
  
  const mergeCols2 = (type === 'queryMonthly') ? 'A2:K2' : 'A2:L2';
  sheet.mergeCells(mergeCols2);
  sheet.getCell('A2').value = reportDate;
  sheet.getCell('A2').font = { name: 'Calibri', size: 11, bold: false };
  sheet.getCell('A2').alignment = { horizontal: 'left', vertical: 'middle' };

  // ===== 🟦 ตารางข้อมูลรายละเอียด (Detail Table) =====
  let dataStartRow = 4; // เริ่มที่แถวที่ 4 (รายละเอียดมาก่อน จากนั้นค่อยเพิ่มตารางสรุปด้านล่าง)
  
  let headers, columnWidths;
  if (type === 'query') {
    headers = [
      'วันที่', 'เวลา',
      'คลอรีนอิสระคงเหลือขาเข้าสถานี (mg/l)',
      'คลอรีนอิสระคงเหลือขาออกสถานี (mg/l)',
      'อัตราการเติมคลอรีน Line1 (Litr/h)',
      'อัตราการเติมคลอรีน Line2 (Litr/h)',
      'อัตราการเติมคลอรีน Line3 (Litr/h)',
      'อัตราการไหลน้ำขาเข้า (m3/h)',
      'อัตราการจ่ายคลอรีนรวม (l/h)',
      'ระดับคลอรีนในถังเก็บ (m)',
      'ปริมาณคลอรีนในถังเก็บ (Litr)',
      'ปริมาณการใช้คลอรีน รายชั่วโมง (Litr)'
    ];
    columnWidths = [16, 16, 14, 14, 14, 13, 13, 12, 14, 18, 18, 18];
  } else if (type === 'queryMonthly') {
    headers = [
      'วันที่',
      'คลอรีนอิสระคงเหลือขาเข้าสถานี (mg/l)',
      'คลอรีนอิสระคงเหลือขาออกสถานี (mg/l)',
      'อัตราการเติมคลอรีน Line1 (Litr/h)',
      'อัตราการเติมคลอรีน Line2 (Litr/h)',
      'อัตราการเติมคลอรีน Line3 (Litr/h)',
      'อัตราการไหลน้ำขาเข้า (m3/h)',
      'อัตราการจ่ายคลอรีนรวม (l/h)',
      'ระดับคลอรีนในถังเก็บ (m)',
      'ปริมาณคลอรีนในถังเก็บ (Litr)',
      'ปริมาณการใช้คลอรีน รายวัน (Litr)'
    ];
    columnWidths = [16, 16, 14, 14, 14, 13, 13, 12, 14, 18];
  } else if (type === 'queryYearly') {
    headers = [
      'เดือน', 'ปี',
      'คลอรีนอิสระคงเหลือขาเข้าสถานี (mg/l)',
      'คลอรีนอิสระคงเหลือขาออกสถานี (mg/l)',
      'อัตราการเติมคลอรีน Line1 (Litr/h)',
      'อัตราการเติมคลอรีน Line2 (Litr/h)',
      'อัตราการเติมคลอรีน Line3 (Litr/h)',
      'อัตราการไหลน้ำขาเข้า (m3/h)',
      'อัตราการจ่ายคลอรีนรวม (l/h)',
      'ระดับคลอรีนในถังเก็บ (m)',
      'ปริมาณคลอรีนในถังเก็บ (Litr)',
      'ปริมาณการใช้คลอรีน รายเดือน (Litr)'
    ];
    columnWidths = [16, 16, 14, 14, 14, 13, 13, 12, 14, 18, 18];
  }

  const headerRow = sheet.getRow(dataStartRow);
  headerRow.values = headers;
  headerRow.height = 40; // ความสูงเหมือนโหมดปกติ

  // ตั้งสไตล์ทีละเซลล์ เฉพาะเซลล์ที่มีค่า (ไม่ตั้งพื้นหลังให้เซลล์ว่าง)
  for (let col = 1; col <= headers.length; col++) {
    const cell = headerRow.getCell(col);
    if (cell.value === undefined || cell.value === null || cell.value === '') {
      continue; // ข้ามเซลล์ว่าง
    }
    cell.font = { name: 'Calibri', size: 8, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFB7D6FF' } // สีฟ้าอ่อน
    };
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' }
    };
  }

  // Set column widths
  columnWidths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  // เพิ่มข้อมูล
  data.forEach((row) => {
    let values;
    if (type === 'query') {
      values = [
        new Date(row.Date_Stamp).toLocaleDateString('th-TH'),
        row.Time_Stamp || '-',
        row.MB_Chlorine_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Chlorine_Outlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Flow_Chlorine_Line1?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Flow_Chlorine_Line2?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Flow_Chlorine_Line3?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Flow_Water_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Total_Flow_Chlorine?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Level_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Volume_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.Chlorine_Per_Hour?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-'
      ];
    } else if (type === 'queryMonthly') {
      values = [
        new Date(row.Date_Stamp).toLocaleDateString('th-TH'),
        row.MB_Chlorine_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Chlorine_Outlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Flow_Chlorine_Line1?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Flow_Chlorine_Line2?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Flow_Chlorine_Line3?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Flow_Water_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Total_Flow_Chlorine?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Level_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Volume_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.Chlorine_Per_Day?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-'
      ];
    }
    else if (type === 'queryYearly') {
      const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
      // แปลงปีเป็น พ.ศ. สำหรับการแสดงผลใน Excel
      // แต่ระวังไม่ให้เพิ่ม 543 ซ้ำ หากข้อมูลที่รับมาเป็น พ.ศ. แล้ว (เช่น frontend อาจแปลงมาแล้ว)
      let displayYear = '-';
      if (row.Year_ !== undefined && row.Year_ !== null && !isNaN(row.Year_)) {
        let y = Number(row.Year_);
        // ถ้าปีมีค่าเป็น พ.ศ. (ประมาณ >= 2500) ให้ใช้ค่าเดิม
        if (y >= 2500) {
          displayYear = y.toString();
        } else {
          displayYear = (y + 543).toString();
        }
      } else {
        displayYear = row.Year_ || '-';
      }
      values = [
        thaiMonths[(row.Month_ || 1) - 1],
        displayYear,
        row.MB_Chlorine_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Chlorine_Outlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Flow_Chlorine_Line1?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Flow_Chlorine_Line2?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Flow_Chlorine_Line3?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Flow_Water_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Total_Flow_Chlorine?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Level_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Volume_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.Chlorine_Per_Month?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-'
      ];
    }
    
    const dataRow = sheet.addRow(values);
    dataRow.alignment = { horizontal: 'center', vertical: 'middle' };
    dataRow.eachCell(cell => {
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' }
      };
    });
  });

  // ===== 🟩/🟨 เพิ่มตารางสรุป (หลังจากตารางรายละเอียด) =====
  const summaryStartRow = sheet.lastRow.number + 2; // เริ่มหลังตารางรายละเอียด + เว้น 1 แถว

  // ตารางที่ 1: สรุปข้อมูล (สีเขียว) - สูงสุด/ต่ำสุด/เฉลี่ย
  const summaryItems = [
    { label: 'คลอรีนอิสระคงเหลือขาเข้าสถานี (mg/l)', key: 'MB_Chlorine_Inlet' },
    { label: 'คลอรีนอิสระคงเหลือขาออกสถานี (mg/l)', key: 'MB_Chlorine_Outlet' },
    { label: 'อัตราการเติมคลอรีน Line1 (Litr/h)', key: 'MB_Flow_Chlorine_Line1' },
    { label: 'อัตราการเติมคลอรีน Line2 (Litr/h)', key: 'MB_Flow_Chlorine_Line2' },
    { label: 'อัตราการเติมคลอรีน Line3 (Litr/h)', key: 'MB_Flow_Chlorine_Line3' },
    { label: 'อัตราการไหลของน้ำขาเข้า (m3/h)', key: 'MB_Flow_Water_Inlet' },
    { label: 'อัตราการจ่ายคลอรีนรวม (m3/h)', key: 'MB_Total_Flow_Chlorine' }
  ];

  // Header ตารางสรุป (สีเขียว)
  sheet.mergeCells(`A${summaryStartRow}:B${summaryStartRow}`);
  sheet.getCell(`A${summaryStartRow}`).value = 'รายการ';
  sheet.getCell(`C${summaryStartRow}`).value = 'สูงสุด';
  sheet.getCell(`D${summaryStartRow}`).value = 'ต่ำสุด';
  sheet.getCell(`E${summaryStartRow}`).value = 'เฉลี่ย';
  ['A', 'B', 'C', 'D', 'E'].forEach(col => {
    const cell = sheet.getCell(`${col}${summaryStartRow}`);
    cell.font = { name: 'Calibri', size: 10, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB7FFD6' } }; // สีเขียว
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' }
    };
  });

  // Data ตารางสรุป
  summaryItems.forEach((item, idx) => {
    const rowNum = summaryStartRow + 1 + idx;
    const values = data.map(row => Number(row[item.key]) || 0);
    const max = values.length ? Math.max(...values) : '';
    const min = values.length ? Math.min(...values) : '';
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : '';

    sheet.mergeCells(`A${rowNum}:B${rowNum}`);
    sheet.getCell(`A${rowNum}`).value = item.label;
    sheet.getCell(`C${rowNum}`).value = max === 0 ? '' : max;
    sheet.getCell(`C${rowNum}`).numFmt = '#,##0.00';
    sheet.getCell(`D${rowNum}`).value = min === 0 ? '' : min;
    sheet.getCell(`D${rowNum}`).numFmt = '#,##0.00';
    sheet.getCell(`E${rowNum}`).value = avg === 0 ? '' : avg;
    sheet.getCell(`E${rowNum}`).numFmt = '#,##0.00';

    ['A', 'B', 'C', 'D', 'E'].forEach(col => {
      const cell = sheet.getCell(`${col}${rowNum}`);
      cell.font = { name: 'Calibri', size: 9 };
      cell.alignment = { horizontal: col === 'A' || col === 'B' ? 'left' : 'right', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' }
      };
    });
    sheet.getRow(rowNum).height = 13;
  });

  // ตารางที่ 2: ผลรวม (สีเหลือง)
  let summaryKeys = [];
  if (type === 'query') {
    summaryKeys = [
      { key: 'Chlorine_Per_Hour', label: 'ปริมาณการจ่ายคลอรีนรวมทั้งวัน (Litr)' },
      { key: 'MB_Flow_Water_Inlet', label: 'ปริมาณน้ำขาเข้ารวมทั้งวัน (m³)' }
    ];
  } else if (type === 'queryMonthly') {
    summaryKeys = [
      { key: 'Chlorine_Per_Day', label: 'ปริมาณการจ่ายคลอรีนรวมทั้งเดือน (Litr)' },
      { key: 'MB_Flow_Water_Inlet', label: 'ปริมาณน้ำขาเข้ารวมทั้งเดือน (m³)' }
    ];
  } else if (type === 'queryYearly') {
    summaryKeys = [
      { key: 'Chlorine_Per_Month', label: 'ปริมาณการจ่ายคลอรีนรวมทั้งปี (Litr)' },
      { key: 'MB_Flow_Water_Inlet', label: 'ปริมาณน้ำขาเข้ารวมทั้งปี (m³)' }
    ];
  }

  const totalStartRow = summaryStartRow + summaryItems.length + 2; // เว้น 1 แถว

  // Header ตารางผลรวม (สีเหลือง)
  sheet.mergeCells(`A${totalStartRow}:B${totalStartRow}`);
  sheet.getCell(`A${totalStartRow}`).value = 'รายการ';
  sheet.getCell(`C${totalStartRow}`).value = 'ผลรวม';
  ['A', 'B', 'C'].forEach(col => {
    const cell = sheet.getCell(`${col}${totalStartRow}`);
    cell.font = { name: 'Calibri', size: 10, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAB7' } }; // สีเหลือง
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' }
    };
  });

  // Data ตารางผลรวม
  summaryKeys.forEach((item, idx) => {
    const rowNum = totalStartRow + 1 + idx;
    const values = data.map(row => Number(row[item.key]) || 0);
    const sum = values.reduce((a, b) => a + b, 0);

    sheet.mergeCells(`A${rowNum}:B${rowNum}`);
    sheet.getCell(`A${rowNum}`).value = item.label;
    sheet.getCell(`C${rowNum}`).value = sum === 0 ? '' : sum;
    sheet.getCell(`C${rowNum}`).numFmt = '#,##0.00';

    ['A', 'B', 'C'].forEach(col => {
      const cell = sheet.getCell(`${col}${rowNum}`);
      cell.font = { name: 'Calibri', size: 9 };
      cell.alignment = { horizontal: col === 'C' ? 'right' : 'left', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' }
      };
    });
    sheet.getRow(rowNum).height = 13;
  });

  // ปรับความกว้างคอลัมน์สำหรับตารางสรุป
  sheet.getColumn('A').width = 35;
  sheet.getColumn('B').width = 13;
  sheet.getColumn('C').width = 15;
  sheet.getColumn('D').width = 15;
  sheet.getColumn('E').width = 15;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=ChlorineReport_Query.xlsx');
  await workbook.xlsx.write(res);
  res.end();
}

// ========== Export Excel สำหรับ Normal Modes (เหมือนเดิม) ==========
async function exportExcelNormal(req, res, data, type) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Chlorine Report');

 // ===== ใส่โลโก้ที่มุมซ้ายบน =====
  if (fs.existsSync(logoPath)) {
    let logoWidth = 110, logoHeight = 100;
    if (type === 'daily' || type === 'query') {
      logoWidth = 95; logoHeight = 75;
    } else if (type === 'monthly' || type === 'queryMonthly') {
      logoWidth = 95; logoHeight = 75;
    } else if (type === 'yearly' || type === 'queryYearly') {
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
  const title = 'รายงานข้อมูลระบบจ่ายคลอรีนอัตโนมัติปลายสาย  สถานีสูบจ่ายประปามีนบุรี';
  if (type === 'monthly' || type === 'queryMonthly') {
    sheet.mergeCells('A1:K1');
  } else {
    sheet.mergeCells('A1:L1');
  }
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
  if (data.length > 0) {
    if (type === 'daily' && data[0].Date_Stamp) {
      const d = new Date(data[0].Date_Stamp);
      const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
      reportDate = `รายการข้อมูล: วันที่ ${d.getDate()} เดือน ${thaiMonths[d.getMonth()]} พ.ศ. ${d.getFullYear() + 543}`;
    } else if (type === 'query' && data[0].Date_Stamp && data[data.length-1].Date_Stamp) {
      const startD = new Date(data[0].Date_Stamp);
      const endD = new Date(data[data.length-1].Date_Stamp);
      const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
      reportDate = `รายการข้อมูล: วันที่ ${startD.getDate()} ${thaiMonths[startD.getMonth()]} ${startD.getFullYear() + 543} ถึง ${endD.getDate()} ${thaiMonths[endD.getMonth()]} ${endD.getFullYear() + 543}`;
    } else if (type === 'monthly' && data[0].Date_Stamp) {
      const d = new Date(data[0].Date_Stamp);
      const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
      reportDate = `รายการข้อมูล: เดือน ${thaiMonths[d.getMonth()]} พ.ศ. ${d.getFullYear() + 543}`;
    } else if (type === 'queryMonthly' && data[0].Date_Stamp && data[data.length-1].Date_Stamp) {
      const startD = new Date(data[0].Date_Stamp);
      const endD = new Date(data[data.length-1].Date_Stamp);
      const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
      reportDate = `รายการข้อมูล: เดือน ${thaiMonths[startD.getMonth()]} ${startD.getFullYear() + 543} ถึง ${thaiMonths[endD.getMonth()]} ${endD.getFullYear() + 543}`;
    } else if (type === 'yearly' && data[0].Year_) {
      reportDate = `รายการข้อมูล: พ.ศ. ${data[0].Year_ + 543}`;
    } else if (type === 'queryYearly' && data[0].Year_) {
      const startYear = Math.min(...data.map(d => d.Year_));
      const endYear = Math.max(...data.map(d => d.Year_));
      // แปลงเป็น พ.ศ. ถ้าจำเป็น (ตรวจสอบว่าเป็น พ.ศ. อยู่แล้วหรือไม่)
      const toBE = y => {
        if (y === undefined || y === null || isNaN(y)) return '-';
        const n = Number(y);
        return n >= 2500 ? n : n + 543;
      };
      const s = toBE(startYear);
      const e = toBE(endYear);
      if (startYear === endYear) {
        reportDate = `รายการข้อมูล: พ.ศ. ${s}`;
      } else {
        reportDate = `รายการข้อมูล: พ.ศ. ${s} ถึง ${e}`;
      }
    }
  }
  if (type === 'monthly' || type === 'queryMonthly') {
    sheet.mergeCells('A2:K2');
  } else {
    sheet.mergeCells('A2:L2');
  }
  sheet.getCell('A2').value = reportDate;
  sheet.getCell('A2').font = { name: 'Calibri', size: 11, bold: false }; // 8 → 11
  sheet.getCell('A2').alignment = { horizontal: 'left', vertical: 'middle' };

  if (type === 'monthly' || type === 'queryMonthly') {
    sheet.mergeCells('A3:K3');
  } else {
    sheet.mergeCells('A3:L3');
  }

  // ===== หัวตาราง (แยกตาม type) =====
  let headers, columnWidths;
  if (type === 'daily' || type === 'query') {
    headers = [
      //'ลำดับ',
      'วันที่',
      'เวลา',
      'คลอรีนอิสระคงเหลือขาเข้าสถานี (mg/l)',
      'คลอรีนอิสระคงเหลือขาออกสถานี (mg/l)',
      'อัตราการเติมคลอรีน Line1 (Litr/h)',
      'อัตราการเติมคลอรีน Line2 (Litr/h)',
      'อัตราการเติมคลอรีน Line3 (Litr/h)',
      'อัตราการไหลน้ำขาเข้า (m3/h)',
      'อัตราการจ่ายคลอรีนรวม (l/h)',
      'ระดับคลอรีนในถังเก็บ (m)',
      'ปริมาณคลอรีนในถังเก็บ (Litr)',
      'ปริมาณการใช้คลอรีน รายชั่วโมง (Litr)'
    ];
    columnWidths = [2, 16, 16, 14, 14, 14, 13, 13, 12, 14, 18];
  } else if(type === 'monthly' || type === 'queryMonthly') {
    headers = [
      //'ลำดับ',
      'วันที่',
      'คลอรีนอิสระคงเหลือขาเข้าสถานี (mg/l)',
      'คลอรีนอิสระคงเหลือขาออกสถานี (mg/l)',
      'อัตราการเติมคลอรีน Line1 (Litr/h)',
      'อัตราการเติมคลอรีน Line2 (Litr/h)',
      'อัตราการเติมคลอรีน Line3 (Litr/h)',
      'อัตราการไหลน้ำขาเข้า (m3/h)',
      'อัตราการจ่ายคลอรีนรวม (l/h)',
      'ระดับคลอรีนในถังเก็บ (m)',
      'ปริมาณคลอรีนในถังเก็บ (Litr)',
      'ปริมาณการใช้คลอรีน รายวัน (Litr)'
    ];
    columnWidths = [2, 16, 16, 14, 14, 14, 13, 13, 12, 14];
  }

  else  {
    headers = [
      //'ลำดับ',
      'เดือน',
      'ปี',
      'คลอรีนอิสระคงเหลือขาเข้าสถานี (mg/l)',
      'คลอรีนอิสระคงเหลือขาออกสถานี (mg/l)',
      'อัตราการเติมคลอรีน Line1 (Litr/h)',
      'อัตราการเติมคลอรีน Line2 (Litr/h)',
      'อัตราการเติมคลอรีน Line3 (Litr/h)',
      'อัตราการไหลน้ำขาเข้า (m3/h)',
      'อัตราการจ่ายคลอรีนรวม (l/h)',
      'ระดับคลอรีนในถังเก็บ (m)',
      'ปริมาณคลอรีนในถังเก็บ (Litr)',
      'ปริมาณการใช้คลอรีน รายเดือน (Litr)'
    ];
    columnWidths = [2, 16, 16, 14, 14, 14, 13, 13, 12, 14, 18];
  }


  
  sheet.addRow(headers);


  // กำหนดความกว้างคอลัมน์
  sheet.getColumn(1).width = 8; // ปรับเลข 8 ตามต้องการ
  columnWidths.forEach((w, i) => {
    sheet.getColumn(i + 2).width = w;
  });

const headerRow = sheet.getRow(4);
headerRow.height = 40; // ปรับความสูงแถวที่ 4 ให้สูงขึ้น เช่น 22

headerRow.eachCell((cell) => {
  cell.font = { name: 'Calibri', size: 8, bold: true }; // ปรับขนาดตัวหนังสือใหญ่ขึ้น เช่น 12
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; // เพิ่ม wrapText
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
    headerRow.getCell(3).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB7D6FF' }
  };
  headerRow.getCell(4).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB7D6FF' }
  };
    headerRow.getCell(5).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB7D6FF' }
  };
  headerRow.getCell(6).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB7D6FF' }
  };
    headerRow.getCell(7).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB7D6FF' }
  };
  headerRow.getCell(8).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB7D6FF' }
  };
    headerRow.getCell(9).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB7D6FF' }
  };
      headerRow.getCell(10).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB7D6FF' }
  };
  headerRow.getCell(11).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB7D6FF' }
  };
    if (type !== 'monthly') {
      headerRow.getCell(12).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFB7D6FF' }
      };
    }


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
    //i + 1,
    /*thaiMonths[(row.Month_ || 1) - 1] ?? '-',
    '-',*/ // ไม่มีเวลาใน yearly
    row.Month_?.toFixed(0) ?? '-',
    (() => {
      if (row.Year_ === undefined || row.Year_ === null || isNaN(row.Year_)) return '-';
      const y = Number(row.Year_);
      return (y >= 2500 ? y : y + 543).toString();
    })(),
    row.MB_Chlorine_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.MB_Chlorine_Outlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',

    row.MB_Flow_Chlorine_Line1?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.MB_Flow_Chlorine_Line2?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.MB_Flow_Chlorine_Line3?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    
    row.MB_Flow_Water_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.MB_Level_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.MB_Volume_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.MB_Total_Flow_Chlorine?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.Chlorine_Per_Month?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-'
  ];
}

    else if (type === 'monthly' || type === 'queryMonthly') {
      values = [
        //i + 1,
        new Date(row.Date_Stamp).toLocaleDateString('th-TH'),
        row.MB_Chlorine_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
        row.MB_Chlorine_Outlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',

        row.MB_Flow_Chlorine_Line1?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Flow_Chlorine_Line2?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Flow_Chlorine_Line3?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',

        row.MB_Flow_Water_Inlet?.toLocaleString() ?? '-',
        row.MB_Level_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
        row.MB_Volume_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
        row.MB_Total_Flow_Chlorine?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
        row.Chlorine_Per_Day?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-'
      ];
    } else if (type === 'daily' || type === 'query'){
      values = [
        //i + 1,
        new Date(row.Date_Stamp).toLocaleDateString('th-TH'),
        (() => {
          try {
            if (typeof row.Time_Stamp === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(row.Time_Stamp)) return row.Time_Stamp;
            const match = row.Time_Stamp && row.Time_Stamp.match(/T(\d{2}):(\d{2}):(\d{2})/);
            if (match) return `${match[1]}:${match[2]}`;
            return row.Time_Stamp;
          } catch { return row.Time_Stamp || '-'; }
        })(),
        row.MB_Chlorine_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
        row.MB_Chlorine_Outlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
        
        row.MB_Flow_Chlorine_Line1?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Flow_Chlorine_Line2?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
        row.MB_Flow_Chlorine_Line3?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',

        row.MB_Flow_Water_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
        row.MB_Level_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
        row.MB_Volume_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
        row.MB_Total_Flow_Chlorine?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-' ?? '-',
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

  // ===== ตรวจสอบว่าเป็น Query mode หรือไม่ =====
  const isQueryMode = (type === 'query' || type === 'queryMonthly' || type === 'queryYearly');

  if (isQueryMode) {
    // ===== ตารางสรุปแบบละเอียดสำหรับ Query modes =====
    let extraSummaryKeys = [];

    if (type === 'query') {
      extraSummaryKeys = [
        { label: 'ปริมาณการจ่ายคลอรีนรวมทั้งวัน (Litr)', key: 'Chlorine_Per_Hour' },
        { label: 'ปริมาณน้ำขาเข้ารวมทั้งวัน (m³)', key: 'MB_Flow_Water_Inlet' },
      ];
    } else if (type === 'queryMonthly') {
      extraSummaryKeys = [
        { label: 'ปริมาณการจ่ายคลอรีนรวมทั้งเดือน (Litr)', key: 'Chlorine_Per_Hour' },
        { label: 'ปริมาณน้ำขาเข้ารวมทั้งเดือน (m³)', key: 'MB_Flow_Water_Inlet' },
      ];
    } else if (type === 'queryYearly') {
      extraSummaryKeys = [
        { label: 'ปริมาณการจ่ายคลอรีนรวมทั้งปี (Litr)', key: 'Chlorine_Per_Month' },
        { label: 'ปริมาณน้ำขาเข้ารวมทั้งปี (m³)', key: 'MB_Flow_Water_Inlet' },
      ];
    }

    const extraStartRow = sheet.lastRow.number + 2;

    // หัวตาราง: รายการ | สูงสุด | ต่ำสุด | เฉลี่ย | ผลรวม
    sheet.getCell(`A${extraStartRow}`).value = 'รายการ';
    sheet.getCell(`B${extraStartRow}`).value = 'สูงสุด';
    sheet.getCell(`C${extraStartRow}`).value = 'ต่ำสุด';
    sheet.getCell(`D${extraStartRow}`).value = 'เฉลี่ย';
    sheet.getCell(`E${extraStartRow}`).value = 'ผลรวม';
    
    ['A', 'B', 'C', 'D', 'E'].forEach(col => {
      const cell = sheet.getCell(`${col}${extraStartRow}`);
      cell.font = { name: 'Calibri', size: 10, bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAB7' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' }
      };
    });

    // เพิ่มแถวข้อมูล
    extraSummaryKeys.forEach((item, idx) => {
      const rowIdx = extraStartRow + 1 + idx;
      const values = data.map(row => Number(row[item.key]) || 0);
      const max = Math.max(...values);
      const min = Math.min(...values);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const sum = values.reduce((a, b) => a + b, 0);

      sheet.getCell(`A${rowIdx}`).value = item.label;
      sheet.getCell(`B${rowIdx}`).value = max;
      sheet.getCell(`B${rowIdx}`).numFmt = '#,##0.00';
      sheet.getCell(`C${rowIdx}`).value = min;
      sheet.getCell(`C${rowIdx}`).numFmt = '#,##0.00';
      sheet.getCell(`D${rowIdx}`).value = avg;
      sheet.getCell(`D${rowIdx}`).numFmt = '#,##0.00';
      sheet.getCell(`E${rowIdx}`).value = sum;
      sheet.getCell(`E${rowIdx}`).numFmt = '#,##0.00';

      ['A', 'B', 'C', 'D', 'E'].forEach(col => {
        const cell = sheet.getCell(`${col}${rowIdx}`);
        cell.font = { name: 'Calibri', size: 9 };
        cell.alignment = { horizontal: col === 'A' ? 'left' : 'right', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin' }, left: { style: 'thin' },
          bottom: { style: 'thin' }, right: { style: 'thin' }
        };
      });

      sheet.getRow(rowIdx).height = 13;
    });

    // ปรับความกว้างคอลัมน์
    sheet.getColumn('A').width = 35;
    sheet.getColumn('B').width = 15;
    sheet.getColumn('C').width = 15;
    sheet.getColumn('D').width = 15;
    sheet.getColumn('E').width = 15;
  } else {
    // ===== ตารางสรุปแบบปกติสำหรับ Daily, Monthly, Yearly =====
    const summaryKeys = [
      { label: 'คลอรีนอิสระคงเหลือขาเข้าสถานี (mg/l)', key: 'MB_Chlorine_Inlet' },
      { label: 'คลอรีนอิสระคงเหลือขาออกสถานี (mg/l)', key: 'MB_Chlorine_Outlet' },

      { label: 'อัตราการเติมคลอรีน Line1 (m³/h)', key: 'MB_Flow_Chlorine_Line1' },
      { label: 'อัตราการเติมคลอรีน Line2 (m³/h)', key: 'MB_Flow_Chlorine_Line2' },
      { label: 'อัตราการเติมคลอรีน Line3 (m³/h)', key: 'MB_Flow_Chlorine_Line3' },

      { label: 'อัตราการไหลของน้ำขาเข้า (m³/h)', key: 'MB_Flow_Water_Inlet' },
      { label: 'อัตราการจ่ายคลอรีนรวม (l/h)', key: 'MB_Total_Flow_Chlorine' }
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

  sheet.getCell(`A${startSummaryRow}`).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  };
  //sheet.mergeCells(`C${startSummaryRow}:D${startSummaryRow}`);
  sheet.getCell(`C${startSummaryRow}`).value = 'สูงสุด';
  sheet.getCell(`C${startSummaryRow}`).font = { name: 'Calibri', size: 8, bold: false };
  sheet.getCell(`C${startSummaryRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getCell(`C${startSummaryRow}`).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB7FFD6' }
  };

    sheet.getCell(`C${startSummaryRow}`).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  };

  //sheet.mergeCells(`E${startSummaryRow}:F${startSummaryRow}`);
  sheet.getCell(`D${startSummaryRow}`).value = 'ต่ำสุด';
  sheet.getCell(`D${startSummaryRow}`).font = { name: 'Calibri', size: 8, bold: false };
  sheet.getCell(`D${startSummaryRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getCell(`D${startSummaryRow}`).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB7FFD6' }
  };

  sheet.getCell(`D${startSummaryRow}`).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  };

  //sheet.mergeCells(`G${startSummaryRow}:H${startSummaryRow}`);
  sheet.getCell(`E${startSummaryRow}`).value = 'เฉลี่ย';
  sheet.getCell(`E${startSummaryRow}`).font = { name: 'Calibri', size: 8, bold: false };
  sheet.getCell(`E${startSummaryRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getCell(`E${startSummaryRow}`).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB7FFD6' }
  };

  sheet.getCell(`E${startSummaryRow}`).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
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
      
    sheet.getCell(`A${rowIdx}`).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  };

    // Merge C:D สำหรับ "สูงสุด"
    //sheet.mergeCells(`C${rowIdx}:D${rowIdx}`);
    let max = arr.length ? Math.max(...arr) : '';
    sheet.getCell(`C${rowIdx}`).value = max === 0 ? '' : (typeof max === 'number' ? max.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-'.replace(/\.?0+$/, '') : '');
    sheet.getCell(`C${rowIdx}`).font = { name: 'Calibri', size: 8, bold: false };
    sheet.getCell(`C${rowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };

    sheet.getCell(`C${rowIdx}`).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  };

    // Merge E:F สำหรับ "ต่ำสุด"
    //sheet.mergeCells(`E${rowIdx}:F${rowIdx}`);
    let min = arr.length ? Math.min(...arr) : '';
    sheet.getCell(`D${rowIdx}`).value = min === 0 ? '' : (typeof min === 'number' ? min.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-'.replace(/\.?0+$/, '') : '');
    sheet.getCell(`D${rowIdx}`).font = { name: 'Calibri', size: 8, bold: false };
    sheet.getCell(`D${rowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
    
    sheet.getCell(`D${rowIdx}`).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  };

    // Merge G:H สำหรับ "เฉลี่ย"
    //sheet.mergeCells(`G${rowIdx}:H${rowIdx}`);
    let avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : '';
    sheet.getCell(`E${rowIdx}`).value = avg === 0 ? '' : (typeof avg === 'number' ? avg.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-'.replace(/\.?0+$/, '') : '');
    sheet.getCell(`E${rowIdx}`).font = { name: 'Calibri', size: 8, bold: false };
    sheet.getCell(`E${rowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };

    sheet.getCell(`E${rowIdx}`).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  };

    // Merge I:J สำหรับ "ผลรวม"
    /*sheet.mergeCells(`I${rowIdx}:J${rowIdx}`);
    let sum = arr.length ? arr.reduce((a, b) => a + b, 0) : '';
    sheet.getCell(`I${rowIdx}`).value = sum === 0 ? '' : (typeof sum === 'number' ? sum.toFixed(3).replace(/\.?0+$/, '') : '');
    sheet.getCell(`I${rowIdx}`).font = { name: 'Calibri', size: 8, bold: false };
    sheet.getCell(`I${rowIdx}`).alignment = { horizontal: 'left', vertical: 'middle' };*/

    // ความสูงแถว summary
    sheet.getRow(rowIdx).height = 13; // 9 → 13

    });

    // ===== ตารางสรุปเพิ่มเติม (ปริมาณคลอรีนและน้ำ) สำหรับโหมดปกติ =====
    let extraSummaryKeys = [];

    if (type === 'daily') {
      extraSummaryKeys = [
        { label: 'ปริมาณการจ่ายคลอรีนรวมทั้งวัน (Litr)', key: 'Chlorine_Per_Day' },
        { label: 'ปริมาณน้ำขาเข้ารวมทั้งวัน (m³)', key: 'MB_Flow_Water_Inlet' },
      ];
    } else if (type === 'monthly') {
      extraSummaryKeys = [
        { label: 'ปริมาณการจ่ายคลอรีนรวมทั้งเดือน (Litr)', key: 'Chlorine_Per_Hour' },
        { label: 'ปริมาณน้ำขาเข้ารวมทั้งเดือน (m³)', key: 'MB_Flow_Water_Inlet' },
      ];
    } else if (type === 'yearly') {
      extraSummaryKeys = [
        { label: 'ปริมาณการจ่ายคลอรีนรวมทั้งปี (Litr)', key: 'Chlorine_Per_Month' },
        { label: 'ปริมาณน้ำขาเข้ารวมทั้งปี (m³)', key: 'MB_Flow_Water_Inlet' },
      ];
    }

    const extraStartRow = sheet.lastRow.number + 2;

    // หัวตาราง
    sheet.mergeCells(`A${extraStartRow}:B${extraStartRow}`);
    sheet.getCell(`A${extraStartRow}`).value = 'รายการ';
    sheet.getCell(`C${extraStartRow}`).value = 'ผลรวม';
    ['A', 'B','C'].forEach(col => {
      const cell = sheet.getCell(`${col}${extraStartRow}`);
      cell.font = { name: 'Calibri', size: 10, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEAB7' }
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // ข้อมูล
    extraSummaryKeys.forEach((item, i) => {
      const rowIdx = extraStartRow + 1 + i;
      const sum = data.map(row => Number(row[item.key]) || 0).reduce((a, b) => a + b, 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-';

      sheet.mergeCells(`A${rowIdx}:B${rowIdx}`);
      sheet.getCell(`A${rowIdx}`).value = item.label;
      sheet.getCell(`A${rowIdx}`).font = { name: 'Calibri', size: 9 };
      sheet.getCell(`A${rowIdx}`).alignment = { horizontal: 'left', vertical: 'middle' };
      sheet.getCell(`A${rowIdx}`).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      sheet.getCell(`C${rowIdx}`).value = sum === '0.00' ? '' : sum;
      sheet.getCell(`C${rowIdx}`).font = { name: 'Calibri', size: 9 };
      sheet.getCell(`C${rowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
      sheet.getCell(`C${rowIdx}`).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      sheet.getRow(rowIdx).height = 13;
    });

    sheet.getColumn('A').width = 35;
    sheet.getColumn('B').width = 13;
    sheet.getColumn('C').width = 15;
  }

  // ===== ส่งไฟล์ =====
  const typeFileNames = {
    daily: 'Daily',
    monthly: 'Monthly',
    yearly: 'Yearly',
    query: 'QueryDaily',
    queryMonthly: 'QueryMonthly',
    queryYearly: 'QueryYearly'
  };
  const fileName = `ChlorineReport_${typeFileNames[type] || 'Report'}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
  await workbook.xlsx.write(res);
  res.end();
}
// -------------------- [4] EXPORT PDF Daily --------------------
app.post('/export/pdf', async (req, res) => {
  // --- [4.1] เตรียม PDF ---
  const data = req.body.data;
  const PDFDocument = require('pdfkit');
  const filename = `ChlorineMinburiReport.pdf`; // ใช้ชื่อเดียวกันทั้ง daily/monthly
  const filepath = path.join(__dirname, filename);

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32 });
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

// ข้อความวันที่ (ปรับให้รองรับโหมด Query: ถ้า start/end เหมือนกันให้แสดงวันเดียว ถ้าไม่ให้แสดงช่วง)
let reportDate = '';
const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
if (data.length > 0 && data[0].Date_Stamp) {
  // ใช้แถวแรกและแถวสุดท้ายเป็นตัวกำหนดช่วง (front-end ส่งเฉพาะ data และ type)
  const startD = new Date(data[0].Date_Stamp);
  const endD = new Date(data[data.length - 1].Date_Stamp);
  const sameDay = startD.getFullYear() === endD.getFullYear()
    && startD.getMonth() === endD.getMonth()
    && startD.getDate() === endD.getDate();

  if (sameDay) {
    reportDate = `ณ วันที่ ${startD.getDate()} ${thaiMonths[startD.getMonth()]} ${startD.getFullYear() + 543}`;
  } else {
    reportDate = `ระหว่างวันที่ ${startD.getDate()} ${thaiMonths[startD.getMonth()]} ${startD.getFullYear() + 543} ถึง ${endD.getDate()} ${thaiMonths[endD.getMonth()]} ${endD.getFullYear() + 543}`;
  }
} else {
  reportDate = 'ณ วันที่ -';
}
doc.font('THSarabun').fontSize(9).fillColor('black')
  .text(reportDate, textX, logoY + 25, { width: textWidth, align: 'left' });

// เลื่อนตำแหน่ง y เพื่อเริ่มวาดหัวตาราง
doc.moveDown(0); // ปรับห่างจาก header ให้พอเหมาะ

  // --- [4.4] กำหนด column และหัวตาราง ---
  const headers = [
    'วันที่',
    'เวลา',
    'คลอรีนอิสระคงเหลือ  ขาเข้าสถานี (mg/l)',
    'คลอรีนอิสระคงเหลือ  ขาออกสถานี (mg/l)',
    'อัตราการเติมคลอรีน Line1 (Litr/h)',
    'อัตราการเติมคลอรีน Line2 (Litr/h)',
    'อัตราการเติมคลอรีน Line3 (Litr/h)',
    'อัตราการไหลน้ำขาเข้า (m3/h)',
    'ระดับคลอรีนใน  ถังเก็บ (m)',
    'ปริมาณคลอรีนใน  ถังเก็บ (Litr)',
    'อัตราการจ่ายคลอรีน  รวม (l/h)',
    'ปริมาณการใช้คลอรีน รายชั่วโมง (Litr)'
  ];
  const columnWidths = [45, 45, 70, 70, 70, 70, 70, 70, 60, 60, 70, 80];
  /*const startX = doc.x;
  let y = doc.y + 3.75 * 1.3 * 1.5 * mainScale;*/

  const startX = logoX;                         // เริ่มชิดซ้ายเท่ากับโลโก้
  const startY = logoY + logoHeight + 20;      // เลื่อนลงพ้นโลโก้และข้อความ
  let y = startY;

  let x = startX;
  const headerBgColor = '#B7D6FF';

  // --- [4.5] วาดหัวตารางบรรทัดเดียว (หัวข้อ+หน่วยรวมกัน) ---
  const headerHeight = 21 * 1.3 * 1.5 * mainScale;
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
      new Date(row.Date_Stamp).toLocaleDateString('th-TH'),
      (() => {
        try {
          if (typeof row.Time_Stamp === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(row.Time_Stamp)) return row.Time_Stamp;
          const match = row.Time_Stamp && row.Time_Stamp.match(/T(\d{2}):(\d{2}):(\d{2})/);
          if (match) return `${match[1]}:${match[2]}`;
          return row.Time_Stamp;
        } catch { return row.Time_Stamp || '-'; }
      })(),
      row.MB_Chlorine_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.MB_Chlorine_Outlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.MB_Flow_Chlorine_Line1?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.MB_Flow_Chlorine_Line2?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.MB_Flow_Chlorine_Line3?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.MB_Flow_Water_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.MB_Level_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.MB_Volume_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.MB_Total_Flow_Chlorine?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.Chlorine_Per_Hour?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-'
    ];
    const cellHeight = 9.375 * 1.3 * 1.5 * mainScale;
    const fontSize = 3.75 * 1.3 * 1.5 * mainScale;
    const verticalOffset = (cellHeight - fontSize) / 2;
    for (let i = 0; i < values.length; i++) {
      doc.rect(x, y, columnWidths[i], cellHeight).stroke();
      doc.font('THSarabun').fontSize(fontSize).text(values[i], x, y + verticalOffset, {
        width: columnWidths[i],
        align: 'center'
      });
      x += columnWidths[i];
    }
    y += cellHeight;
    // ตรวจสอบว่าจะขึ้นหน้าใหม่ไหม (ปล่อยให้ขึ้นหน้าใหม่อัตโนมัติได้ทุกหน้า)
    if (y > doc.page.height - 50) { // เหลือพื้นที่น้อยกว่า 50 points ก็ขึ้นหน้าใหม่
      doc.addPage();
      y = 50; // เริ่มต้นหน้าใหม่ที่ตำแหน่ง y = 50
      
      // วาดหัวตารางใหม่ในหน้าใหม่ (ใช้สไตล์เดียวกับหน้าหลัก)
      x = startX;
      for (let i = 0; i < headers.length; i++) {
        doc.rect(x, y, columnWidths[i], headerHeight).fillAndStroke(headerBgColor, 'black');
        doc.font('THSarabun-Bold').fontSize(9 * mainScale).fillColor('black').text(
          headers[i], x, y + 5, { width: columnWidths[i], align: 'center' }
        );
        x += columnWidths[i];
      }
      y += headerHeight;
    }
  });
  // --- [4.7] คำนวณ summary ---
  // (ลบส่วนคำนวณ summary และวาด summary ออกทั้งหมด)
  // *** ลบตั้งแต่ const getMax ... ถึงจบ forEach วาด summary ***

  // --- [4.5.1] วาดตารางสรุปแบบละเอียด (Summary Table) ---
  const summaryHeaders = ['รายการ', 'สูงสุด', 'ต่ำสุด', 'เฉลี่ย'/*, 'ผลรวม'*/];
  const summaryKeys = [
    { label: 'คลอรีนอิสระคงเหลือขาเข้าสถานี (mg/l)', key: 'MB_Chlorine_Inlet' },
    { label: 'คลอรีนอิสระคงเหลือขาออกสถานี (mg/l)', key: 'MB_Chlorine_Outlet' },
    { label: 'อัตราการเติมคลอรีน Line1 (Litr/h)', key: 'MB_Flow_Chlorine_Line1' },
    { label: 'อัตราการเติมคลอรีน Line2 (Litr/h)', key: 'MB_Flow_Chlorine_Line2' },
    { label: 'อัตราการเติมคลอรีน Line3 (Litr/h)', key: 'MB_Flow_Chlorine_Line3' },
    { label: 'อัตราการไหลของน้ำขาเข้า (m³)', key: 'MB_Flow_Water_Inlet' },
    { label: 'อัตราการจ่ายคลอรีนรวม (l/h)', key: 'MB_Total_Flow_Chlorine' }
    /*{ label: 'ระดับคลอรีนในถัง (m)', key: 'Level_Chlorine_Tank' },
    { label: 'ปริมาณคลอรีนในถัง (Litr)', key: 'Volume_Chlorine_Tank' }*/
  ];

  const Scale = 1 / 1.25;
  const summaryScale = 3.0;
  const summaryColWidths = [50, 26, 26, 26/*, 26*/].map(w => w * summaryScale * mainScale);
  const summaryRowHeight = 7 * summaryScale * mainScale;
  const summaryFontSize = 9 * mainScale;
  const summaryTableWidth = summaryColWidths.reduce((a, b) => a + b, 0);
  const margin = 30;
  const pageWidth = doc.page.width - margin * 2;

  // ตำแหน่งชิดซ้าย
  let startXSummary = margin; // ชิดซ้ายเลย
  let ySummary = y + 30; // ให้ summary อยู่ถัดจากตารางหลัก
  // ถ้าพื้นที่ไม่พอสำหรับ summary table ให้ขึ้นหน้าใหม่ก่อนวาด
  const summaryBlockHeight = summaryRowHeight * (summaryKeys.length + 1); // +1 for header
  if (ySummary + summaryBlockHeight > doc.page.height - margin) {
    doc.addPage();
    ySummary = margin;
    startXSummary = margin; // ถ้าขึ้นหน้าใหม่ให้ติดมุมซ้าย
  }

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

  
  // ตารางผลรวมเฉพาะ (วางข้างๆตารางสรุป)
  const yStartTotal = ySummary - summaryRowHeight * summaryKeys.length - summaryRowHeight; // กลับไปที่ตำแหน่งเริ่มต้นของตารางสรุป

  // 🔸 สรุปผลรวมเฉพาะ (Flow + Chlorine Summary)
  const totalOnlyHeaders = ['รายการ', 'ผลรวม'];
  const totalOnlyKeys = [
    { label: 'ปริมาณการจ่ายคลอรีนรวมทั้งวัน (Litr)', key: 'Chlorine_Per_Hour' }, // 👈 เปลี่ยนตามโหมดที่ใช้
    { label: 'ปริมาณน้ำขาเข้ารวมทั้งวัน (m³)', key: 'MB_Flow_Water_Inlet' }
  ];
  const totalColWidths = [220, 120].map(w => w * mainScale);
  const totalRowHeight = 18 * mainScale;
  const totalFontSize = 10 * mainScale;

  // วางตารางผลรวมข้างๆตารางสรุป
  const startXTotal = startXSummary + summaryTableWidth + 20; // ห่างจากตารางสรุป 20px
  let yTotal = yStartTotal;

// วาดหัวตารางผลรวม
let tx = startXTotal;
for (let i = 0; i < totalOnlyHeaders.length; i++) {
  doc.rect(tx, yTotal, totalColWidths[i], totalRowHeight).fillAndStroke('#FFEAB7', 'black');
  doc.font('THSarabun-Bold')
    .fontSize(totalFontSize)
    .fillColor('black')
    .text(totalOnlyHeaders[i], tx, yTotal + (totalRowHeight / 4), {
      width: totalColWidths[i], align: 'center'
    });
  tx += totalColWidths[i];
}
yTotal += totalRowHeight;

// วาดข้อมูลผลรวม
totalOnlyKeys.forEach(item => {
  tx = startXTotal;
  const sum = data.map(row => Number(row[item.key]) || 0).reduce((a, b) => a + b, 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const rowVals = [item.label, sum];
  for (let i = 0; i < rowVals.length; i++) {
    doc.rect(tx, yTotal, totalColWidths[i], totalRowHeight).stroke();
    doc.font('THSarabun')
      .fontSize(totalFontSize)
      .text(rowVals[i], tx, yTotal + (totalRowHeight - totalFontSize) / 2, {
        width: totalColWidths[i], align: 'center'
      });
    tx += totalColWidths[i];
  }
  yTotal += totalRowHeight;
});

  // ปรับ ySummary ให้เป็นตัวที่สูงกว่าระหว่าง ySummary กับ yTotal
  ySummary = Math.max(ySummary, yTotal) + 10;

  


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

// ข้อความวันที่ (ปรับให้รองรับกรณีเลือกช่วงเดือน: ถ้าเริ่มต้นและสิ้นสุดเป็นเดือนเดียวกันให้แสดงเดือนเดียว, มิฉะนั้นแสดงช่วงเดือน)
let reportDate = '';
const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
if (data.length > 0 && data[0].Date_Stamp && data[data.length - 1] && data[data.length - 1].Date_Stamp) {
  const startD = new Date(data[0].Date_Stamp);
  const endD = new Date(data[data.length - 1].Date_Stamp);
  // ถ้าเป็นเดือนและปีเดียวกัน ให้แสดงแค่เดือนนั้น
  if (startD.getMonth() === endD.getMonth() && startD.getFullYear() === endD.getFullYear()) {
    reportDate = `ณ เดือน ${thaiMonths[startD.getMonth()]} ${startD.getFullYear() + 543}`;
  } else {
    reportDate = `ระหว่างเดือน ${thaiMonths[startD.getMonth()]} ${startD.getFullYear() + 543} ถึง ${thaiMonths[endD.getMonth()]} ${endD.getFullYear() + 543}`;
  }
} else {
  reportDate = 'ณ เดือน -';
}
doc.font('THSarabun').fontSize(9).fillColor('black')
  .text(reportDate, textX, logoY + 25, { width: textWidth, align: 'left' });

// เลื่อนตำแหน่ง y เพื่อเริ่มวาดหัวตาราง
doc.moveDown(0); // ปรับห่างจาก header ให้พอเหมาะ

  // กำหนด column และหัวตารางสำหรับ monthly
  const headers = [
    'วันที่',
    'คลอรีนอิสระคงเหลือ  ขาเข้าสถานี (mg/l)',
    'คลอรีนอิสระคงเหลือ  ขาออกสถานี (mg/l)',
    'อัตราการเติมคลอรีน Line1 (Litr/h)',
    'อัตราการเติมคลอรีน Line2 (Litr/h)',
    'อัตราการเติมคลอรีน Line3 (Litr/h)',
    'อัตราการไหลน้ำขาเข้า (m3/h)',
    'ระดับคลอรีนในถังเก็บ (m)',
    'ปริมาณคลอรีนในถังเก็บ (Litr)',
    'อัตราการจ่ายคลอรีนรวม (l/h)',
    'ปริมาณการใช้คลอรีน รายวัน (Litr)'
  ];
  const columnWidths = [40, 75, 75, 70, 70, 70, 70, 70, 75, 75, 80, 80];
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
    new Date(row.Date_Stamp).toLocaleDateString('th-TH'),
    row.MB_Chlorine_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.MB_Chlorine_Outlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.MB_Flow_Chlorine_Line1?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.MB_Flow_Chlorine_Line2?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.MB_Flow_Chlorine_Line3?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.MB_Flow_Water_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.MB_Level_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.MB_Volume_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
    row.MB_Total_Flow_Chlorine?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
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

  // ตรวจสอบว่าจะขึ้นหน้าใหม่ไหม (ปล่อยให้ขึ้นหน้าใหม่อัตโนมัติได้ทุกหน้า)
if (y > doc.page.height - 50) { // เหลือพื้นที่น้อยกว่า 50 points ก็ขึ้นหน้าใหม่
  doc.addPage();
  y = 50; // เริ่มต้นหน้าใหม่ที่ตำแหน่ง y = 50
  
  // วาดหัวตารางใหม่ในหน้าใหม่ (ใช้สไตล์เดียวกับหน้าหลัก)
  x = startX;
  for (let i = 0; i < headers.length; i++) {
    doc.rect(x, y, columnWidths[i], headerHeight).fillAndStroke(headerBgColor, 'black');
    doc.font('THSarabun-Bold').fontSize(9 * mainScale).fillColor('black').text(
      headers[i], x, y + 5, { width: columnWidths[i], align: 'center' }
    );
    x += columnWidths[i];
  }
  y += headerHeight;
}
});

  // --- วาดตารางสรุปแบบละเอียด (Summary Table) ---
  const summaryHeaders = ['รายการ', 'สูงสุด', 'ต่ำสุด', 'เฉลี่ย'/*, 'ผลรวม'*/]; 
  const summaryKeys = [
    { label: 'คลอรีนอิสระคงเหลือขาเข้าสถานี (mg/l)', key: 'MB_Chlorine_Inlet' },
    { label: 'คลอรีนอิสระคงเหลือขาออกสถานี (mg/l)', key: 'MB_Chlorine_Outlet' },
    { label: 'อัตราการเติมคลอรีน Line1 (Litr/h)', key: 'MB_Flow_Chlorine_Line1' },
    { label: 'อัตราการเติมคลอรีน Line2 (Litr/h)', key: 'MB_Flow_Chlorine_Line2' },
    { label: 'อัตราการเติมคลอรีน Line3 (Litr/h)', key: 'MB_Flow_Chlorine_Line3' },
    { label: 'อัตราการไหลของน้ำขาเข้า (m³)', key: 'MB_Flow_Water_Inlet' },
    { label: 'อัตราการจ่ายคลอรีนรวม (l/h)', key: 'MB_Total_Flow_Chlorine' }
    /*{ label: 'ระดับคลอรีนในถัง (m)', key: 'Level_Chlorine_Tank' },
    { label: 'ปริมาณคลอรีนในถัง (Litr)', key: 'Volume_Chlorine_Tank' }*/
  ];

  const Scale = 1 / 1.5;
  const summaryScale = 3.0;
  const summaryColWidths = [50, 26, 26, 26/*, 26*/].map(w => w * summaryScale * mainScale);
  const summaryRowHeight = 8 * summaryScale * mainScale;
  const summaryFontSize = 9 * mainScale;
  const summaryTableWidth = summaryColWidths.reduce((a, b) => a + b, 0);
  const margin = 30;
  const pageWidth = doc.page.width - margin * 2;

  // ตำแหน่งชิดซ้าย (เหมือน Daily)
  let startXSummary = margin; // ชิดซ้ายเลย
  let ySummary = y + 30; // ให้ summary อยู่ถัดจากตารางหลัก
  // ถ้าพื้นที่ไม่พอสำหรับ summary table ให้ขึ้นหน้าใหม่ก่อนวาด
  const summaryBlockHeight = summaryRowHeight * (summaryKeys.length + 1); // +1 for header
  if (ySummary + summaryBlockHeight > doc.page.height - margin) {
    doc.addPage();
    ySummary = margin;
    startXSummary = margin; // ถ้าขึ้นหน้าใหม่ให้ติดมุมซ้าย
  }

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

// ตารางผลรวมเฉพาะ (วางข้างๆตารางสรุป - เหมือน Daily)
const yStartTotal = ySummary - summaryRowHeight * summaryKeys.length - summaryRowHeight; // กลับไปที่ตำแหน่งเริ่มต้นของตารางสรุป

// 🔸 สรุปผลรวมเฉพาะ (Flow + Chlorine Summary)
const totalOnlyHeaders = ['รายการ', 'ผลรวม'];
const totalOnlyKeys = [
  { label: 'ปริมาณการจ่ายคลอรีนรวมทั้งเดือน (Litr)', key: 'Chlorine_Per_Day' }, // 👈 เปลี่ยนตามโหมดที่ใช้
  { label: 'ปริมาณน้ำขาเข้ารวมทั้งเดือน (m³)', key: 'MB_Flow_Water_Inlet' }
  
];
const totalColWidths = [220, 120].map(w => w * mainScale);
const totalRowHeight = 18 * mainScale;
const totalFontSize = 10 * mainScale;

// วางตารางผลรวมข้างๆตารางสรุป (เหมือน Daily)
const startXTotal = startXSummary + summaryTableWidth + 20; // ห่างจากตารางสรุป 20px
let yTotal = yStartTotal;

// วาดหัวตารางผลรวม
let tx = startXTotal;
for (let i = 0; i < totalOnlyHeaders.length; i++) {
  doc.rect(tx, yTotal, totalColWidths[i], totalRowHeight).fillAndStroke('#FFEAB7', 'black');
  doc.font('THSarabun-Bold')
    .fontSize(totalFontSize)
    .fillColor('black')
    .text(totalOnlyHeaders[i], tx, yTotal + (totalRowHeight / 4), {
      width: totalColWidths[i], align: 'center'
    });
  tx += totalColWidths[i];
}
yTotal += totalRowHeight;

// วาดข้อมูลผลรวม
totalOnlyKeys.forEach(item => {
  tx = startXTotal;
  const sum = data.map(row => Number(row[item.key]) || 0).reduce((a, b) => a + b, 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const rowVals = [item.label, sum];
  for (let i = 0; i < rowVals.length; i++) {
    doc.rect(tx, yTotal, totalColWidths[i], totalRowHeight).stroke();
    doc.font('THSarabun')
      .fontSize(totalFontSize)
      .text(rowVals[i], tx, yTotal + (totalRowHeight - totalFontSize) / 2, {
        width: totalColWidths[i], align: 'center'
      });
    tx += totalColWidths[i];
  }
  yTotal += totalRowHeight;
});

  // ปรับ ySummary ให้เป็นตัวที่สูงกว่าระหว่าง ySummary กับ yTotal
  ySummary = Math.max(ySummary, yTotal) + 10;
  

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
  const type = req.body.type || 'yearly'; // รับค่า type จาก request (yearly หรือ queryYearly)
  console.log('📄 PDF Yearly Export - Type:', type, 'Data rows:', data.length);
  
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
if (type === 'queryYearly' && data.length > 0) {
  // Query mode - แสดงช่วงปี (แต่ถ้าเป็นปีเดียวกัน ให้แสดงปีเดียว)
  const rawStart = data[0].Year_;
  const rawEnd = data[data.length - 1].Year_;
  const toBE = y => {
    if (y === undefined || y === null || isNaN(y)) return '-';
    const n = Number(y);
    return n >= 2500 ? n : n + 543;
  };
  const startYear = toBE(rawStart);
  const endYear = toBE(rawEnd);
  if (startYear !== '-' && endYear !== '-' && startYear === endYear) {
    // ถ้าเป็นปีเดียวกัน ให้แสดงปีเดียว เช่น "ณ ปี 2568"
    reportDate = `ณ ปี ${startYear}`;
  } else {
    reportDate = `ช่วงปี ${startYear} - ${endYear}`;
  }
} else if (data.length > 0 && data[0].Year_) {
  const single = (data[0].Year_ !== undefined && data[0].Year_ !== null && !isNaN(data[0].Year_)) ? (Number(data[0].Year_) >= 2500 ? Number(data[0].Year_) : Number(data[0].Year_) + 543) : '-';
  reportDate = `ณ ปี ${single}`; // ✅ แสดงปี พ.ศ.
} else {
  reportDate = 'ณ ปี -';
}
doc.font('THSarabun').fontSize(9).fillColor('black')
  .text(reportDate, textX, logoY + 25, { width: textWidth, align: 'left' });

// เลื่อนตำแหน่ง y เพื่อเริ่มวาดหัวตาราง
doc.moveDown(0); // ปรับห่างจาก header ให้พอเหมาะ

  // กำหนด column และหัวตารางสำหรับ Yearly
const headers = [
  'เดือน',
  'ปี',
  'คลอรีนอิสระคงเหลือ  ขาเข้าสถานี (mg/l)',
  'คลอรีนอิสระคงเหลือ  ขาออกสถานี (mg/l)',
  'อัตราการเติมคลอรีน Line1 (Litr/h)',
  'อัตราการเติมคลอรีน Line2 (Litr/h)',
  'อัตราการเติมคลอรีน Line3 (Litr/h)',
  'อัตราการไหลน้ำขาเข้า (m3/h)',
  'ระดับคลอรีนใน  ถังเก็บ (m)',
  'ปริมาณคลอรีนใน  ถังเก็บ (Litr)',
  'อัตราการจ่ายคลอรีน  รวม (l/h)',
  'ปริมาณการใช้คลอรีน รายเดือน (Litr)'
];
const columnWidths = [40, 40, 70, 70, 70, 70, 70, 70, 70, 70, 70, 80];
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
      row.Month_?.toFixed(0) ?? '-',
      (() => {
        if (row.Year_ === undefined || row.Year_ === null || isNaN(row.Year_)) return '-';
        const y = Number(row.Year_);
        return (y >= 2500 ? y : y + 543).toString();
      })(),
      row.MB_Chlorine_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.MB_Chlorine_Outlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.MB_Flow_Chlorine_Line1?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.MB_Flow_Chlorine_Line2?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.MB_Flow_Chlorine_Line3?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.MB_Flow_Water_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.MB_Level_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.MB_Volume_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
      row.MB_Total_Flow_Chlorine?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '-',
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
    // ตรวจสอบว่าจะขึ้นหน้าใหม่ไหม (ปล่อยให้ขึ้นหน้าใหม่อัตโนมัติได้ทุกหน้า)
    if (y > doc.page.height - 50) { // เหลือพื้นที่น้อยกว่า 50 points ก็ขึ้นหน้าใหม่
      doc.addPage();
      y = 50; // เริ่มต้นหน้าใหม่ที่ตำแหน่ง y = 50
      
      // วาดหัวตารางใหม่ในหน้าใหม่ (ใช้สไตล์เดียวกับหน้าหลัก)
      x = startX;
      for (let i = 0; i < headers.length; i++) {
        doc.rect(x, y, columnWidths[i], headerHeight).fillAndStroke(headerBgColor, 'black');
        doc.font('THSarabun-Bold').fontSize(9 * mainScale).fillColor('black').text(
          headers[i], x, y + 5, { width: columnWidths[i], align: 'center' }
        );
        x += columnWidths[i];
      }
      y += headerHeight;
    }
  });

  // --- วาดตารางสรุปแบบละเอียด (Summary Table) ---
  const summaryHeaders = ['รายการ', 'สูงสุด', 'ต่ำสุด', 'เฉลี่ย'/*, 'ผลรวม'*/]; 
  const summaryKeys = [
    { label: 'คลอรีนอิสระคงเหลือขาเข้าสถานี (mg/l)', key: 'MB_Chlorine_Inlet' },
    { label: 'คลอรีนอิสระคงเหลือขาออกสถานี (mg/l)', key: 'MB_Chlorine_Outlet' },
    { label: 'อัตราการเติมคลอรีน Line1 (Litr/h)', key: 'MB_Flow_Chlorine_Line1' },
    { label: 'อัตราการเติมคลอรีน Line2 (Litr/h)', key: 'MB_Flow_Chlorine_Line2' },
    { label: 'อัตราการเติมคลอรีน Line3 (Litr/h)', key: 'MB_Flow_Chlorine_Line3' },
    { label: 'อัตราการไหลของน้ำขาเข้า (m³)', key: 'MB_Flow_Water_Inlet' },
    { label: 'อัตราการจ่ายคลอรีนรวม (l/h)', key: 'MB_Total_Flow_Chlorine' }
    /*{ label: 'ระดับคลอรีนในถัง (m)', key: 'Level_Chlorine_Tank' },
    { label: 'ปริมาณคลอรีนในถัง (Litr)', key: 'Volume_Chlorine_Tank' }*/
  ];

  const summaryScale = 3.0;
  const summaryColWidths = [50, 26, 26, 26/*, 26*/].map(w => w * summaryScale * mainScale);
  const summaryRowHeight = 8 * summaryScale * mainScale;
  const summaryFontSize = 9 * mainScale;
  const summaryTableWidth = summaryColWidths.reduce((a, b) => a + b, 0);
  const margin = 30;
  const pageWidth = doc.page.width - margin * 2;

  // ตำแหน่งขวาสุด
  let startXSummary = margin; // ติดมุมซ้ายเสมอ
  let ySummary = y + 30; // ให้ summary อยู่ถัดจากตารางหลัก
  // ถ้าพื้นที่ไม่พอสำหรับ summary table ให้ขึ้นหน้าใหม่ก่อนวาด
  const summaryBlockHeight = summaryRowHeight * (summaryKeys.length + 1); // +1 for header
  if (ySummary + summaryBlockHeight > doc.page.height - margin) {
    doc.addPage();
    ySummary = margin;
    startXSummary = margin; // ถ้าขึ้นหน้าใหม่ให้ติดมุมซ้าย
  }

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

  // ตารางผลรวมเฉพาะ (วางข้างๆ ตาราง summary)
  // คำนวณตำแหน่งเริ่มต้นของตารางผลรวมให้อยู่ในแนวเดียวกันกับ summary
  // ย้อนกลับจาก ySummary ปัจจุบัน (หลังวาด summary แล้ว) ไปยังจุดเริ่มต้นของ summary
  const yStartTotal = ySummary - summaryRowHeight * summaryKeys.length - summaryRowHeight;
  const startXTotal = startXSummary + summaryTableWidth + 20; // เว้นระยะ 20px จากตาราง summary
  let yTotal = yStartTotal;

  console.log('📊 PDF Yearly - Total Table Position:', {
    ySummary,
    yStartTotal,
    startXSummary,
    startXTotal,
    summaryTableWidth,
    summaryRowHeight,
    summaryKeysLength: summaryKeys.length,
    type
  });

  // 🔸 สรุปผลรวมเฉพาะ (Flow + Chlorine Summary)
  const totalOnlyHeaders = ['รายการ', 'ผลรวม'];
  const totalOnlyKeys = type === 'queryYearly' ? [
    { label: 'ปริมาณการจ่ายคลอรีนรวมทั้งปี (Litr)', key: 'Chlorine_Per_Month' },
    { label: 'ปริมาณน้ำขาเข้ารวมทั้งปี (m³)', key: 'MB_Flow_Water_Inlet' }
  ] : [
    { label: 'ปริมาณการจ่ายคลอรีนรวมทั้งปี (Litr)', key: 'Chlorine_Per_Month' },
    { label: 'ปริมาณน้ำขาเข้ารวมทั้งปี (m³)', key: 'MB_Flow_Water_Inlet' }
  ];
  const totalColWidths = [220, 120].map(w => w * mainScale);
  const totalRowHeight = 18 * mainScale;
  const totalFontSize = 10 * mainScale;

  // วาดหัวตาราง
  let tx = startXTotal;
  for (let i = 0; i < totalOnlyHeaders.length; i++) {
    doc.rect(tx, yTotal, totalColWidths[i], totalRowHeight).fillAndStroke('#FFEAB7', 'black');
    doc.font('THSarabun-Bold')
      .fontSize(totalFontSize)
      .fillColor('black')
      .text(totalOnlyHeaders[i], tx, yTotal + (totalRowHeight / 4), {
        width: totalColWidths[i], align: 'center'
      });
    tx += totalColWidths[i];
  }
  yTotal += totalRowHeight;

  // วาดข้อมูล
  totalOnlyKeys.forEach((item, index) => {
    tx = startXTotal;
    const sum = data.map(row => Number(row[item.key]) || 0).reduce((a, b) => a + b, 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
    console.log(`📊 PDF Yearly - Row ${index}: ${item.label}, sum = ${sum}, X=${startXTotal}, Y=${yTotal}`);
    const rowVals = [item.label, sum];
    for (let i = 0; i < rowVals.length; i++) {
      // วาดกรอบและพื้นหลังสีขาว
      doc.rect(tx, yTotal, totalColWidths[i], totalRowHeight).fillAndStroke('white', 'black');
      // วาดข้อความ
      doc.font('THSarabun')
        .fontSize(totalFontSize)
        .fillColor('black')
        .text(rowVals[i], tx, yTotal + (totalRowHeight - totalFontSize) / 2, {
          width: totalColWidths[i], align: 'center'
        });
      tx += totalColWidths[i];
    }
    yTotal += totalRowHeight;
  });

  // ปรับ ySummary ให้เป็นตัวที่สูงกว่าระหว่าง ySummary กับ yTotal
  ySummary = Math.max(ySummary, yTotal) + 10;



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
// Simple login endpoint: validate username/password and return success/fail
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.json({ success: false, message: 'กรุณาระบุชื่อผู้ใช้และรหัสผ่าน' });
  }
  try {
    await sql.connect(config);
    // Try to get role, fallback if column doesn't exist
    let loginResult;
    try {
      loginResult = await sql.query`SELECT username, role FROM Login WHERE username = ${username} AND password = ${password}`;
    } catch (roleErr) {
      loginResult = await sql.query`SELECT username FROM Login WHERE username = ${username} AND password = ${password}`;
      if (loginResult.recordset.length > 0) {
        loginResult.recordset[0].role = 'Normal User';
      }
    }
    
    if (loginResult.recordset.length === 0) {
      return res.json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }
    // Successful login - return username and role
    res.json({ success: true, user: { username: loginResult.recordset[0].username, role: loginResult.recordset[0].role } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

// -------------------- [USERS API - CRUD for dbo.Login] --------------------
// Assumptions:
// - Table name is Login (dbo.Login)
// - Columns at minimum: username (unique), password, role
// NOTE: Passwords are currently handled in plaintext to match existing login behavior.
// For production, replace with hashed passwords and proper auth.

// GET all users
app.get('/api/users', async (req, res) => {
  try {
    await sql.connect(config);
    console.log('Connected to DB, querying Login table...');
    // Try selecting with role column first
    let result;
    try {
      result = await sql.query`SELECT username, password, role FROM Login ORDER BY username`;
    } catch (roleErr) {
      // If role column doesn't exist, try without it and add default role
      console.log('Role column not found, querying without role and adding default...');
      result = await sql.query`SELECT username, password FROM Login ORDER BY username`;
      result.recordset = result.recordset.map(u => ({ ...u, role: 'Normal User' }));
    }
    console.log('Query result:', result.recordset);
    res.json(result.recordset || []);
  } catch (err) {
    console.error('GET /api/users error:', err);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

// Create user
app.post('/api/users', async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  try {
    await sql.connect(config);
    const exists = await sql.query`SELECT username FROM Login WHERE username = ${username}`;
    if (exists.recordset.length > 0) return res.status(409).json({ error: 'User already exists' });
    
    const userRole = role || 'Normal User';
    // Try inserting with role
    try {
      await sql.query`INSERT INTO Login (username, password, role) VALUES (${username}, ${password}, ${userRole})`;
    } catch (roleErr) {
      // If role column doesn't exist, insert without it
      console.log('Role column not found, inserting without role...');
      await sql.query`INSERT INTO Login (username, password) VALUES (${username}, ${password})`;
    }
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('POST /api/users error:', err);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

// Update user by username (allows changing username, password and role)
app.put('/api/users/:username', async (req, res) => {
  const target = req.params.username;
  const { newUsername, password, role } = req.body || {};
  if (!target) return res.status(400).json({ error: 'Target username required' });
  try {
    await sql.connect(config);
    const users = await sql.query`SELECT username FROM Login WHERE username = ${target}`;
    if (users.recordset.length === 0) return res.status(404).json({ error: 'User not found' });

    // If changing username, ensure new one is not taken
    if (newUsername && newUsername !== target) {
      const taken = await sql.query`SELECT username FROM Login WHERE username = ${newUsername}`;
      if (taken.recordset.length > 0) return res.status(409).json({ error: 'New username already exists' });
    }

    const finalUsername = newUsername || target;
    
    // Try updating with role column
    try {
      if (password && role) {
        await sql.query`UPDATE Login SET username = ${finalUsername}, password = ${password}, role = ${role} WHERE username = ${target}`;
      } else if (password) {
        await sql.query`UPDATE Login SET username = ${finalUsername}, password = ${password} WHERE username = ${target}`;
      } else if (role) {
        await sql.query`UPDATE Login SET username = ${finalUsername}, role = ${role} WHERE username = ${target}`;
      } else {
        await sql.query`UPDATE Login SET username = ${finalUsername} WHERE username = ${target}`;
      }
    } catch (roleErr) {
      // If role column doesn't exist, update without it
      console.log('Role column not found, updating without role...');
      if (password) {
        await sql.query`UPDATE Login SET username = ${finalUsername}, password = ${password} WHERE username = ${target}`;
      } else {
        await sql.query`UPDATE Login SET username = ${finalUsername} WHERE username = ${target}`;
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/users error:', err);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

// Delete user by username
app.delete('/api/users/:username', async (req, res) => {
  const target = req.params.username;
  if (!target) return res.status(400).json({ error: 'username required' });
  try {
    await sql.connect(config);
    const userRes = await sql.query`SELECT username FROM Login WHERE username = ${target}`;
    if (userRes.recordset.length === 0) return res.status(404).json({ error: 'User not found' });
    
    // Check if user is Admin and prevent deleting last Admin
    try {
      const roleCheck = await sql.query`SELECT role FROM Login WHERE username = ${target}`;
      if (roleCheck.recordset[0]?.role === 'Admin') {
        const adminCount = await sql.query`SELECT COUNT(*) AS cnt FROM Login WHERE role = 'Admin'`;
        if (adminCount.recordset[0].cnt <= 1) {
          return res.status(400).json({ error: 'ไม่สามารถลบ Admin คนสุดท้ายได้' });
        }
      }
    } catch (roleErr) {
      console.log('Role column not found, skipping Admin check...');
    }
    
    await sql.query`DELETE FROM Login WHERE username = ${target}`;
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/users error:', err);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// -------------------- [DEBUG ENDPOINT] --------------------
app.get('/api/debug/test-db', async (req, res) => {
  try {
    await sql.connect(config);
    // Test 1: List all tables
    const tables = await sql.query`SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME`;
    
    // Test 2: Try to read from Login table
    let loginData = null;
    let loginError = null;
    try {
      const loginResult = await sql.query`SELECT TOP 5 username FROM Login`;
      loginData = loginResult.recordset;
    } catch (e) {
      loginError = e.message;
    }
    
    res.json({ 
      success: true, 
      tables: tables.recordset,
      loginSample: loginData,
      loginError: loginError
    });
  } catch (err) {
    console.error('DEBUG test-db error:', err);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

// Setup roles - one-time endpoint to add role column and set default values
app.post('/api/debug/setup-roles', async (req, res) => {
  try {
    await sql.connect(config);
    let messages = [];
    
    // Step 1: Try to add role column if not exists
    try {
      await sql.query`ALTER TABLE Login ADD role NVARCHAR(50) NULL`;
      messages.push('เพิ่มคอลัมน์ role สำเร็จ');
    } catch (addErr) {
      if (addErr.message.includes('already an object')) {
        messages.push('คอลัมน์ role มีอยู่แล้ว');
      } else {
        messages.push('ข้อผิดพลาดขณะเพิ่มคอลัมน์: ' + addErr.message);
      }
    }
    
    // Step 2: Set Admin role for Administrator and QUALITY
    const adminUpdate = await sql.query`UPDATE Login SET role = 'Admin' WHERE username IN ('Administrator', 'QUALITY')`;
    messages.push(`ตั้งค่า Admin สำเร็จ (${adminUpdate.rowsAffected[0]} แถว)`);
    
    // Step 3: Set Normal User for others with NULL role
    const normalUpdate = await sql.query`UPDATE Login SET role = 'Normal User' WHERE role IS NULL OR role = ''`;
    messages.push(`ตั้งค่า Normal User สำเร็จ (${normalUpdate.rowsAffected[0]} แถว)`);
    
    // Step 4: Return all users with their roles
    const users = await sql.query`SELECT username, role FROM Login ORDER BY username`;
    
    res.json({ 
      success: true, 
      messages: messages,
      users: users.recordset
    });
  } catch (err) {
    console.error('Setup roles error:', err);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

// -------------------- [5] START SERVER --------------------
app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
