let currentData = [];
let chartInstance = null; // <-- ย้ายมาด้านบนสุด
let chlorineChartInstance = null;
let flowChartInstance = null;

function getReport() {
  const type = document.getElementById('reportType').value;
  let date = '';
  if (type === 'daily') {
    let day = document.getElementById('reportDay').value;
    let month = document.getElementById('reportMonth').value;
    let year = document.getElementById('reportYear').value;
    day = day.padStart(2, '0');
    month = month.padStart(2, '0');
    date = `${year}-${month}-${day}`;
  } else if (type === 'monthly') {
    const month = document.getElementById('reportMonth').value;
    const year = document.getElementById('reportYear').value;
    date = `${year}-${month.padStart(2, '0')}-01`;
  } else if (type === 'yearly') {
    date = document.getElementById('reportYear').value;
  }

  if (!date || !type) {
    alert("กรุณาเลือกข้อมูลให้ครบถ้วน");
    return;
  }

  document.getElementById('showChartBtn').style.display = 'none'; // ซ่อนปุ่มก่อน

  fetch(`/ChlorineReport?date=${date}&type=${type}`)
    .then(res => res.json())
    .then(data => {
      // เรียงข้อมูลตามเวลา (Time_Stamp, time, hour)
      data.sort((a, b) => {
        let ta = a.Time_Stamp || a.time || a.hour || '';
        let tb = b.Time_Stamp || b.time || b.hour || '';
        // แปลงเป็น HH:mm สำหรับเปรียบเทียบ
        if (typeof ta === 'string') {
          const parts = ta.split(':');
          ta = parts[0].padStart(2, '0') + ':' + (parts[1] ? parts[1].padStart(2, '0') : '00');
        }
        if (typeof tb === 'string') {
          const parts = tb.split(':');
          tb = parts[0].padStart(2, '0') + ':' + (parts[1] ? parts[1].padStart(2, '0') : '00');
        }
        return ta.localeCompare(tb);
      });

      currentData = data;
      renderTable(data, type);
      renderSummary(data); // <<== เพิ่มบรรทัดนี้

      // แสดงปุ่มกราฟ
      document.getElementById('summary-total').style.display = '';
      document.getElementById('showChartBtn').style.display = '';
    })
    .catch(() => alert('โหลดข้อมูลล้มเหลว'));
}

function renderTable(data, type) {
  const thead = document.querySelector('#reportTable thead');
  const tbody = document.querySelector('#reportTable tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10">ไม่มีข้อมูล</td></tr>';
    return;
  }

  if (type === 'daily') {
    // หัวตาราง daily
    thead.innerHTML = `
      <tr style="background:#2563eb;color:#fff;">
        <th rowspan="2">ลำดับ</th>
        <th rowspan="2">วันที่</th>
        <th rowspan="2">เวลา</th>
        <th colspan="2">ปริมาณคลอรีน (mg/l)</th>
        <th rowspan="2">อัตราการไหลของน้ำขาเข้า<br>(m³/h)</th>
        <th rowspan="2">อัตราการจ่ายคลอรีนรวม<br>(l/h)</th>
        <th rowspan="2">ระดับคลอรีนในถังเก็บ<br>(m)</th>
        <th rowspan="2">ปริมาณคลอรีนในถังเก็บ<br>(Litr)</th>
        <th rowspan="2">ปริมาณการใช้คลอรีน<br>รายชั่วโมง (Litr)</th> <!-- เพิ่มตรงนี้ -->
      </tr>
      <tr style="background:#2563eb;color:#fff;">
        <th>ขาเข้าสถานี</th>
        <th>ขาออกสถานี</th>
      </tr>
    `;

    // เติมข้อมูลแบบ daily
    data.forEach((row, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${
          row.Date_Stamp
            ? new Date(row.Date_Stamp).toLocaleDateString('en-GB')
            : '-'
        }</td>
        <td>${
          (() => {
            let t = row.Time_Stamp || row.time || row.hour;
            if (!t) return '00:00';
            if (typeof t === 'string') {
              const match = t.match(/T?(\d{1,2}):(\d{2})/);
              if (match) {
                return match[1].padStart(2, '0') + ':' + match[2];
              }
              const parts = t.split(':');
              if (parts.length >= 2) {
                return parts[0].padStart(2, '0') + ':' + parts[1].padStart(2, '0');
              }
              return t;
            }
            if (t instanceof Date) {
              return t.getHours().toString().padStart(2, '0') + ':' + t.getMinutes().toString().padStart(2, '0');
            }
            return t;
          })()
        }</td>
        <td>${row.Chlorine_Inlet?.toFixed?.(2) ?? '-'}</td>
        <td>${row.Chlorine_Outlet?.toFixed?.(2) ?? '-'}</td>
        <td>${row.Flow_Water_Inlet?.toLocaleString?.() ?? '-'}</td>
        <td>${row.Total_Flow_Chlorine?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.Level_Chlorine_Tank?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.Volume_Chlorine_Tank?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.Chlorine_Per_Hour?.toLocaleString?.(2) ?? '-'}</td> <!-- เพิ่มตรงนี้ -->
      `;
      tbody.appendChild(tr);
    });
  } else if (type === 'monthly') {
    // หัวตาราง monthly
    thead.innerHTML = `
      <tr style="background:#2563eb;color:#fff;">
        <th rowspan="2">ลำดับ</th>
        <th rowspan="2">วันที่</th>
        <th colspan="2">ปริมาณคลอรีน (mg/l)</th>
        <th rowspan="2">อัตราการไหลของน้ำขาเข้า<br>(m³/h)</th>
        <th rowspan="2">อัตราการจ่ายคลอรีนรวม<br>(l/h)</th>
        <th rowspan="2">ระดับคลอรีนในถังเก็บ<br>(m)</th>
        <th rowspan="2">ปริมาณคลอรีนในถังเก็บ<br>(Litr)</th>
        <th rowspan="2">ปริมาณการใช้คลอรีน<br>รายวัน (Litr)</th> <!-- เพิ่มตรงนี้ -->
      </tr>
      <tr style="background:#2563eb;color:#fff;">
        <th>ขาเข้าสถานี</th>
        <th>ขาออกสถานี</th>
      </tr>
    `;

    // เติมข้อมูลแบบ monthly
    data.forEach((row, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${
          row.Date_Stamp
            ? new Date(row.Date_Stamp).toLocaleDateString('th-TH')
            : '-'
        }</td>
        <td>${row.Chlorine_Inlet?.toFixed?.(2) ?? '-'}</td>
        <td>${row.Chlorine_Outlet?.toFixed?.(2) ?? '-'}</td>
        <td>${row.Flow_Water_Inlet?.toLocaleString?.() ?? '-'}</td>
        <td>${row.Total_Flow_Chlorine?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.Level_Chlorine_Tank?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.Volume_Chlorine_Tank?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.Chlorine_Per_Day?.toLocaleString?.(2) ?? '-'}</td> <!-- เพิ่มตรงนี้ -->
      `;
      tbody.appendChild(tr);
    });
  } else if (type === 'yearly') {
thead.innerHTML = `
  <tr style="background:#2563eb;color:#fff;">
    <th rowspan="2">ลำดับ</th>
    <th rowspan="2">เดือน</th>
    <th rowspan="2">ปี</th>
    <th colspan="2">ปริมาณคลอรีน (mg/l)</th>
    <th rowspan="2">อัตราการไหลของน้ำขาเข้า<br>(m³/h)</th>
    <th rowspan="2">อัตราการจ่ายคลอรีนรวม<br>(l/h)</th>
    <th rowspan="2">ระดับคลอรีนในถังเก็บ<br>(m)</th>
    <th rowspan="2">ปริมาณคลอรีนในถังเก็บ<br>(Litr)</th>
    <th rowspan="2">ปริมาณการใช้คลอรีน<br>รายเดือน (Litr)</th>
  </tr>
  <tr style="background:#2563eb;color:#fff;">
    <th>ขาเข้าสถานี</th>
    <th>ขาออกสถานี</th>
  </tr>
`;
  data.forEach((row, i) => {
    const tr = document.createElement('tr');
    
    //const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    //<td>${thaiMonths[(row.Month_ ?? 1) - 1]}</td> //เอาเผื่อไว้ใช้กับ Yearly Preview
    tr.innerHTML = `
      <td>${i + 1}</td>
    
      <td>${row.Month_?.toFixed?.(0) ?? '-'}</td>
      <td>${row.Year_?.toFixed?.(0) ?? '-'}</td>
        <td>${row.Chlorine_Inlet?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.Chlorine_Outlet?.toFixed?.(2) ?? '-'}</td>
        <td>${row.Flow_Water_Inlet?.toLocaleString?.() ?? '-'}</td>
        <td>${row.Total_Flow_Chlorine?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.Level_Chlorine_Tank?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.Volume_Chlorine_Tank?.toLocaleString?.(2) ?? '-'}</td>
      <td>${row.Chlorine_Per_Month?.toLocaleString?.(2) ?? '-'}</td> <!-- เพิ่มตรงนี้ -->
      `;
    tbody.appendChild(tr);
  });
}
}

function formatNumber(value) {
  return (Number(value) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function renderSummary(data) {
  if (!data || data.length === 0) {
    document.getElementById('summary').innerHTML = '';
    document.getElementById('summary-total').innerHTML = '';
    return;
  }
  // คีย์ที่ต้องการสรุปแบบละเอียด
  const keys = [
    { key: 'Chlorine_Inlet', label: 'ปริมาณคลอรีนขาเข้า (mg/l)' },
    { key: 'Chlorine_Outlet', label: 'ปริมาณคลอรีนขาออก (mg/l)' },
    { key: 'Flow_Water_Inlet', label: 'อัตราการไหลของน้ำขาเข้า (m³)' },
    { key: 'Total_Flow_Chlorine', label: 'อัตราการจ่ายคลอรีนรวม (l/h)' },
    /*{ key: 'Level_Chlorine_Tank', label: 'ระดับคลอรีนในถัง (m)' },
    { key: 'Volume_Chlorine_Tank', label: 'ปริมาณคลอรีนในถัง (Litr)' },
    { key: 'Chlorine_Per_Month', label: 'ปริมาณการใช้คลอรีน รายเดือน (Litr)' }*/
  ];
  const getMax = key => Math.max(...data.map(row => Number(row[key]) || 0));
  const getMin = key => Math.min(...data.map(row => Number(row[key]) || 0));
  const getAvg = key => (data.reduce((sum, row) => sum + (Number(row[key]) || 0), 0) / data.length).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const getSum = key => data.reduce((sum, row) => sum + (Number(row[key]) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ตารางสรุปสูงสุด ต่ำสุด เฉลี่ย ผลรวม (ขยายความกว้าง)
  let html = `<table class="styled-table" style="margin-top:1rem;max-width:100%;min-width:1200px;">
    <thead>
      <tr>
        <th style="min-width:120px;">รายการ</th>
        ${keys.map(k => `<th style="min-width:160px;">${k.label}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>สูงสุด</td>
        ${keys.map(k => `<td>${getMax(k.key).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`).join('')}
      </tr>
      <tr>
        <td>ต่ำสุด</td>
        ${keys.map(k => `<td>${getMin(k.key).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`).join('')}
      </tr>
      <tr>
        <td>เฉลี่ย</td>
        ${keys.map(k => `<td>${getAvg(k.key).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`).join('')}
      </tr>

    </tbody>
  </table>`;
  document.getElementById('summary').innerHTML = html;

  /*      <tr>
        <td>ผลรวม11111</td>
        ${keys.map(k => {
          // แสดงผลรวมเฉพาะน้ำกับคลอรีน (Flow_Water_Inlet, Total_Flow_Chlorine) ที่เหลือเว้นว่าง
          if (k.key === 'Flow_Water_Inlet' || k.key === 'Total_Flow_Chlorine') {
            return `<td>${getSum(k.key)}</td>`;
          } else {
            return `<td></td>`;
          }
        }).join('')}
      </tr>*/
      
  // ไม่ต้องแสดง summary-total
  //document.getElementById('summary-total').innerHTML = '';

// 🟦 เพิ่มตารางสรุปผลรวมของ Flow และ Chlorine
const type = document.getElementById('reportType').value;
let totalSummary = [];

if (type === 'daily') {
  totalSummary = [
    { key: 'Chlorine_Per_Hour', label: 'ปริมาณการใช้คลอรีนรายวัน (m3)' },
    { key: 'Flow_Water_Inlet', label: 'อัตราการไหลน้ำขาเข้ารวมทั้งวัน (litr)' },
  ];
} else if (type === 'monthly') {
  totalSummary = [
    { key: 'Chlorine_Per_Day', label: 'ปริมาณการใช้คลอรีนรายเดือน (m3)' },
    { key: 'Flow_Water_Inlet', label: 'อัตราการไหลน้ำขาเข้ารวมทั้งเดือน (litr)' },
  ];
} else if (type === 'yearly') {
  totalSummary = [
    { key: 'Chlorine_Per_Month', label: 'ปริมาณการใช้คลอรีนรายปี (m3)' },
    { key: 'Flow_Water_Inlet', label: 'อัตราการไหลน้ำขาเข้ารวมทั้งปี (litr)' },
  ];
}

let totalHTML = `<table class="styled-table" style="margin-top:1rem;max-width:600px;">
  <thead><tr><th>รายการ</th><th>ผลรวม</th></tr></thead>
  <tbody>
    ${totalSummary.map(item => {
      const sum = data.reduce((a, b) => a + (Number(b[item.key]) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `<tr><td>${item.label}</td><td>${sum}</td></tr>`;
    }).join('')}
  </tbody>
</table>`;
document.getElementById('summary-total').innerHTML = totalHTML;


}

function exportExcel() {
  if (currentData.length === 0) {
    alert("ไม่มีข้อมูลสำหรับ Export");
    return;
  }
  const type = document.getElementById('reportType').value;
  const typeMap = { daily: 'Daily', monthly: 'Monthly', yearly: 'Yearly' };

  fetch('/export/excel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: currentData, type })
  })
    .then(response => {
      if (!response.ok) throw new Error("Failed to export Excel");
      return response.blob();
    })
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MinburiChlorine${typeMap[type] || 'Daily'}.xlsx`; // <<== แก้ตรงนี้
      document.body.appendChild(a);
      a.click();
      a.remove();
    })
    .catch(() => alert('Export Excel ล้มเหลว'));
}

function exportPDF() {
  if (!currentData || currentData.length === 0) {
    alert("ไม่มีข้อมูลสำหรับ Export");
    return;
  }
  const type = document.getElementById('reportType').value;
  let url = '/export/pdf';
  if (type === 'monthly') url = '/export/pdf/monthly';
  else if (type === 'yearly') url = '/export/pdf/yearly';
  const typeMap = { daily: 'Daily', monthly: 'Monthly', yearly: 'Yearly' };

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: currentData, type })
  })
    .then(res => res.blob())
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MinburiChlorine${typeMap[type] || 'Daily'}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    })
    .catch(() => alert('Export PDF ล้มเหลว'));
}

const PdfPrinter = require('pdfmake');
const fs = require('fs');

function exportChlorineReport(data, res) {
  const fonts = {
    Sarabun: {
      normal: 'fonts/Sarabun-Bold.ttf',
      bold: 'fonts/Sarabun-Bold.ttf',
      italics: 'fonts/Sarabun-Bold.ttf',
      bolditalics: 'fonts/Sarabun-Bold.ttf'
    }
  };
  const printer = new PdfPrinter(fonts);

  const docDefinition = {
    content: [
      { text: 'รายงานการใช้คลอรีน', style: 'header', alignment: 'center' },
      { text: `วันที่ออกรายงาน: ${new Date().toLocaleDateString('th-TH')}`, style: 'subheader', alignment: 'right', margin: [0, 0, 0, 10] },
      {
        table: {
          headerRows: 1,
          widths: [60, 120, 100, 90, 90, 90, 140, 140, 140, 160],
          body: [
            [
              'ลำดับ', 'วันที่', 'เวลา',
              { text: 'ปริมาณคลอรีนขาเข้า (mg/l)', style: 'smallCell' },
              { text: 'ปริมาณคลอรีนขาออก (mg/l)', style: 'smallCell' },
              { text: 'อัตราการไหลน้ำ (m3/h)', style: 'smallCell' },
              { text: 'อัตราการจ่ายคลอรีน (l/h)', style: 'smallCell' },
              'ระดับคลอรีนในถัง (m)',
              'ปริมาณคลอรีนในถัง (Litr)',
              'Totalizer จาก Flow Meter1 (Litr)'
            ],
            ...data.map((row, i) => [
              i + 1,
              new Date(row.Date_Stamp).toLocaleDateString('th-TH'),
              new Date(row.Time_Stamp).toLocaleTimeString('th-TH'),
              { text: row.Chlorine_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '-', style: 'smallCell' },
              { text: row.Chlorine_Outlet?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '-', style: 'smallCell' },
              { text: row.Flow_Water_Inlet?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '-', style: 'smallCell' },
              { text: row.Total_Flow_Chlorine?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '-', style: 'smallCell' },
              row.Level_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '-',
              row.Volume_Chlorine_Tank?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '-',
              row.TOT_Chlorine_Line1?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '-'
            ])
          ]
        },
        fontSize: 12,
        layout: {
          hLineWidth: () => 2,
          vLineWidth: () => 2,
          paddingLeft: () => 10,
          paddingRight: () => 10,
          paddingTop: () => 8,
          paddingBottom: () => 8
        }
      }
    ],
    styles: {
      header: { fontSize: 18, bold: true, font: 'Sarabun' },
      subheader: { fontSize: 12, italics: true, font: 'Sarabun' },
      smallCell: { fontSize: 8, font: 'Sarabun' }
    },
    defaultStyle: { font: 'Sarabun' }
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=ChlorineReport.pdf');
  pdfDoc.pipe(res);
  pdfDoc.end();
}

const found = data.find(row => {
  if (!row.time) return false;
  let t = row.time;
  // แปลง t เป็น HH:mm ตาม logic เดิม
  // ...
  return t === hh;
});

module.exports = exportChlorineReport;

function showChart() {
  const type = document.getElementById('reportType').value;
  const data = currentData;

  if (!data || data.length === 0) {
    alert('ไม่มีข้อมูลสำหรับแสดงกราฟ');
    return;
  }

  let labels, chlorineIn, chlorineOut, flowData, chlorineTotalData;

  if (type === 'yearly') {
    labels = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
    ];
    chlorineIn = Array(12).fill(0);
    chlorineOut = Array(12).fill(0);
    flowData = Array(12).fill(0);
    chlorineTotalData = Array(12).fill(0);

    data.forEach(row => {
      const month = (row.Month_ || row.month || 0) - 1;
      if (month >= 0 && month < 12) {
        chlorineIn[month] = Number(row.Chlorine_Inlet) || 0;
        chlorineOut[month] = Number(row.Chlorine_Outlet) || 0;
        flowData[month] = Number(row.Flow_Water_Inlet) || 0;
        chlorineTotalData[month] = Number(row.Total_Flow_Chlorine) || 0;
      }
    });
  } else if (type === 'monthly') {
    labels = data.map(row => {
      const date = new Date(row.Date_Stamp);
      return date.getDate();
    });
    chlorineIn = data.map(row => Number(row.Chlorine_Inlet));
    chlorineOut = data.map(row => Number(row.Chlorine_Outlet));
    flowData = data.map(row => Number(row.Flow_Water_Inlet));
    chlorineTotalData = data.map(row => Number(row.Total_Flow_Chlorine));
  } else {
    labels = data.map(row => row.Time_Stamp || '');
    chlorineIn = data.map(row => Number(row.Chlorine_Inlet));
    chlorineOut = data.map(row => Number(row.Chlorine_Outlet));
    flowData = data.map(row => Number(row.Flow_Water_Inlet));
    chlorineTotalData = data.map(row => Number(row.Total_Flow_Chlorine));
  }

  // กราฟคลอรีน
  const ctx = document.getElementById('chlorineChart').getContext('2d');
  if (window.chlorineChartInstance) window.chlorineChartInstance.destroy();
  window.chlorineChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'คลอรีนขาเข้า (mg/l)', data: chlorineIn, borderColor: 'blue', fill: false },
        { label: 'คลอรีนขาออก (mg/l)', data: chlorineOut, borderColor: 'red', fill: false }
      ]
    }
  });

  // กราฟ flow
  const flowLabels = labels;
  const flowCtx = document.getElementById('flowChart').getContext('2d');
  if (window.flowChartInstance) window.flowChartInstance.destroy();
  window.flowChartInstance = new Chart(flowCtx, {
    type: 'line',
    data: {
      labels: flowLabels,
      datasets: [
        { label: 'อัตราการไหลน้ำขาเข้า (m³/h)', data: flowData, borderColor: 'green', fill: false },
        { label: 'อัตราการจ่ายคลอรีนรวม (l/h)', data: chlorineTotalData, borderColor: 'orange', fill: false }
      ]
    }
  });
}

function updateDateInput() {
  const type = document.getElementById('reportType').value;
  const group = document.getElementById('dateInputGroup');
  const today = new Date();
  if (!type) {
    group.style.display = 'none';
    group.innerHTML = '';
    return;
  }
  group.style.display = 'flex';
  if (type === 'daily') {
    group.innerHTML = `
      <label>วัน:
        <select id="reportDay"></select>
      </label>
      <label>เดือน:
        <select id="reportMonth">
          <option value="1">ม.ค.</option>
          <option value="2">ก.พ.</option>
          <option value="3">มี.ค.</option>
          <option value="4">เม.ย.</option>
          <option value="5">พ.ค.</option>
          <option value="6">มิ.ย.</option>
          <option value="7">ก.ค.</option>
          <option value="8">ส.ค.</option>
          <option value="9">ก.ย.</option>
          <option value="10">ต.ค.</option>
          <option value="11">พ.ย.</option>
          <option value="12">ธ.ค.</option>
        </select>
      </label>
      <label>ปี:
        <input type="number" id="reportYear" min="2000" max="2100" value="${today.getFullYear()}">
      </label>
    `;
    // อัปเดตจำนวนวันตามเดือน/ปี
    function updateDays() {
      const month = parseInt(document.getElementById('reportMonth').value, 10);
      const year = parseInt(document.getElementById('reportYear').value, 10);
      let days = 31;
      if ([4, 6, 9, 11].includes(month)) days = 30;
      else if (month === 2) {
        // เช็คปีอธิกสุรทิน
        days = ((year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)) ? 29 : 28;
      }
      const daySelect = document.getElementById('reportDay');
      daySelect.innerHTML = Array.from({length: days}, (_, i) => `<option value="${i+1}">${i+1}</option>`).join('');
    }
    updateDays(); // เรียกฟังก์ชันอัปเดตจำนวนวัน

    // เพิ่ม event listener เมื่อเปลี่ยนเดือนหรือปี
    document.getElementById('reportMonth').addEventListener('change', updateDays);
    document.getElementById('reportYear').addEventListener('change', updateDays);
  } else if (type === 'monthly') {
    group.innerHTML = `
      <label>เดือน:
        <select id="reportMonth">
          <option value="1">มกราคม</option>
          <option value="2">กุมภาพันธ์</option>
          <option value="3">มีนาคม</option>
          <option value="4">เมษายน</option>
          <option value="5">พฤษภาคม</option>
          <option value="6">มิถุนายน</option>
          <option value="7">กรกฎาคม</option>
          <option value="8">สิงหาคม</option>
          <option value="9">กันยายน</option>
          <option value="10">ตุลาคม</option>
          <option value="11">พฤศจิกายน</option>
          <option value="12">ธันวาคม</option>
        </select>
      </label>
      <label>ปี: <input type="number" id="reportYear" min="2000" max="2100" value="${today.getFullYear()}"></label>
    `;
  } else if (type === 'yearly') {
    group.innerHTML = `<label>ปี: <input type="number" id="reportYear" min="2000" max="2100" value="${today.getFullYear()}"></label>`;
  }
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('dateInputGroup').style.display = 'none'; // ซ่อนช่องเลือกวัน/เดือน/ปีตอนโหลดหน้า
  updateDateInput();
});

function showDateTH() {
  const dateStr = document.getElementById('reportDate').value;
  const span = document.getElementById('dateTH');
  if (!dateStr) {
    span.textContent = '';
    return;
  }
  const [yyyy, mm, dd] = dateStr.split('-');
  span.textContent = `วันที่ ${dd}/${mm}/${yyyy}`;
}