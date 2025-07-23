let currentData = [];
let chartInstance = null; // <-- ย้ายมาด้านบนสุด
let chlorineChartInstance = null;
let flowChartInstance = null;

function getReport() {
  const date = document.getElementById('reportDate').value;
  const type = document.getElementById('reportType').value;

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
        <th rowspan="2">ปริมาณคลอรีนในถังเก็บ<br>(ลิตร)</th>
        <th rowspan="2">ปริมาณการใช้คลอรีน<br>รายชั่วโมง (ลิตร)</th> <!-- เพิ่มตรงนี้ -->
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
        <td>${row.Total_Flow_Chlorine?.toFixed?.(2) ?? '-'}</td>
        <td>${row.Level_Chlorine_Tank?.toFixed?.(2) ?? '-'}</td>
        <td>${row.Volume_Chlorine_Tank?.toFixed?.(2) ?? '-'}</td>
        <td>${row.Chlorine_Per_Hour?.toFixed?.(2) ?? '-'}</td> <!-- เพิ่มตรงนี้ -->
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
        <th rowspan="2">ปริมาณคลอรีนในถังเก็บ<br>(ลิตร)</th>
        <th rowspan="2">ปริมาณการใช้คลอรีน<br>รายวัน (ลิตร)</th> <!-- เพิ่มตรงนี้ -->
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
            ? new Date(row.Date_Stamp).toLocaleDateString('en-GB')
            : '-'
        }</td>
        <td>${row.Chlorine_Inlet?.toFixed?.(2) ?? '-'}</td>
        <td>${row.Chlorine_Outlet?.toFixed?.(2) ?? '-'}</td>
        <td>${row.Flow_Water_Inlet?.toLocaleString?.() ?? '-'}</td>
        <td>${row.Total_Flow_Chlorine?.toFixed?.(2) ?? '-'}</td>
        <td>${row.Level_Chlorine_Tank?.toFixed?.(2) ?? '-'}</td>
        <td>${row.Volume_Chlorine_Tank?.toFixed?.(2) ?? '-'}</td>
        <td>${row.Chlorine_Per_Day?.toFixed?.(2) ?? '-'}</td> <!-- เพิ่มตรงนี้ -->
      `;
      tbody.appendChild(tr);
    });
  }
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
    { key: 'Flow_Water_Inlet', label: 'อัตราการไหลของน้ำขาเข้า (m³/h)' },
    { key: 'Total_Flow_Chlorine', label: 'อัตราการจ่ายคลอรีนรวม (l/h)' },
    { key: 'Level_Chlorine_Tank', label: 'ระดับคลอรีนในถัง (m)' },
    { key: 'Volume_Chlorine_Tank', label: 'ปริมาณคลอรีนในถัง (ลิตร)' }
  ];
  const getMax = key => Math.max(...data.map(row => Number(row[key]) || 0));
  const getMin = key => Math.min(...data.map(row => Number(row[key]) || 0));
  const getAvg = key => (data.reduce((sum, row) => sum + (Number(row[key]) || 0), 0) / data.length).toFixed(2);
  const getSum = key => data.reduce((sum, row) => sum + (Number(row[key]) || 0), 0).toFixed(2);

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
        ${keys.map(k => `<td>${getMax(k.key).toFixed(2)}</td>`).join('')}
      </tr>
      <tr>
        <td>ต่ำสุด</td>
        ${keys.map(k => `<td>${getMin(k.key).toFixed(2)}</td>`).join('')}
      </tr>
      <tr>
        <td>เฉลี่ย</td>
        ${keys.map(k => `<td>${getAvg(k.key)}</td>`).join('')}
      </tr>
      <tr>
        <td>ผลรวม</td>
        ${keys.map(k => {
          // แสดงผลรวมเฉพาะน้ำกับคลอรีน (Flow_Water_Inlet, Total_Flow_Chlorine) ที่เหลือเว้นว่าง
          if (k.key === 'Flow_Water_Inlet' || k.key === 'Total_Flow_Chlorine') {
            return `<td>${getSum(k.key)}</td>`;
          } else {
            return `<td></td>`;
          }
        }).join('')}
      </tr>
    </tbody>
  </table>`;
  document.getElementById('summary').innerHTML = html;

  // ไม่ต้องแสดง summary-total
  document.getElementById('summary-total').innerHTML = '';
}

function exportExcel() {
  if (currentData.length === 0) {
    alert("ไม่มีข้อมูลสำหรับ Export");
    return;
  }
  const type = document.getElementById('reportType').value;
  let filename = 'ChlorineMinburiReport.xlsx';
  if (type === 'monthly') filename = 'ChlorineMinburi Report Monthly.xlsx';
  else if (type === 'daily') filename = 'ChlorineMinburi Report Daily.xlsx';
  else if (type === 'yearly') filename = 'ChlorineMinburi Report Yearly.xlsx';

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
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    })
    .catch(() => alert('Export Excel ล้มเหลว'));
}

function exportPDF() {
  if (!currentData || currentData.length === 0) {
    alert("ไม่มีข้อมูลสำหรับ Export");
    return;
  }
  const type = document.getElementById('reportType').value;
  let filename = 'ChlorineMinburiReport.pdf';
  let url = '/export/pdf';
  if (type === 'monthly') {
    filename = 'ChlorineMinburi Report Monthly.pdf';
    url = '/export/pdf/monthly';
  } else if (type === 'daily') {
    filename = 'ChlorineMinburi Report Daily.pdf';
  } else if (type === 'yearly') {
    filename = 'ChlorineMinburi Report Yearly.pdf';
  }

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
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
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
              'ปริมาณคลอรีนในถัง (ลิตร)',
              'Totalizer จาก Flow Meter1 (ลิตร)'
            ],
            ...data.map((row, i) => [
              i + 1,
              new Date(row.Date_Stamp).toLocaleDateString('th-TH'),
              new Date(row.Time_Stamp).toLocaleTimeString('th-TH'),
              { text: row.Chlorine_Inlet?.toFixed(2) ?? '-', style: 'smallCell' },
              { text: row.Chlorine_Outlet?.toFixed(2) ?? '-', style: 'smallCell' },
              { text: row.Flow_Water_Inlet?.toFixed(2) ?? '-', style: 'smallCell' },
              { text: row.Total_Flow_Chlorine?.toFixed(2) ?? '-', style: 'smallCell' },
              row.Level_Chlorine_Tank?.toFixed(2) ?? '-',
              row.Volume_Chlorine_Tank?.toFixed(2) ?? '-',
              row.TOT_Chlorine_Line1?.toFixed(2) ?? '-'
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
  if (!currentData || currentData.length === 0) {
    alert('กรุณากด Preview ก่อน หรือไม่มีข้อมูล');
    return;
  }
  // เวลาที่แสดงในกราฟ เอาแค่ HH.mm (เช่น 14.30)
  const labels = currentData.map((row, i) => {
    let t = row.Time_Stamp || row.time || row.hour;
    if (!t) return (i < 10 ? '0' : '') + i + '.00';
    if (typeof t === 'string') {
      const match = t.match(/T?(\d{1,2}):(\d{2})/);
      if (match) return match[1].padStart(2, '0') + ':' + match[2];
      const parts = t.split(':');
      if (parts.length >= 2) return parts[0].padStart(2, '0') + ':' + parts[1].padStart(2, '0');
      return t;
    }
    return t;
  });

  // ข้อมูลกราฟ
  const chlorineIn = currentData.map(row => Number(row.Chlorine_Inlet) || 0);
  const chlorineOut = currentData.map(row => Number(row.Chlorine_Outlet) || 0);
  const flowWater = currentData.map(row => Number(row.Flow_Water_Inlet) || 0);
  const flowChlorine = currentData.map(row => Number(row.Total_Flow_Chlorine) || 0);

  // คำนวณ Error (|ขาเข้า - ขาออก|)
  const chlorineError = currentData.map(row =>
    Math.abs((Number(row.Chlorine_Inlet) || 0) - (Number(row.Chlorine_Outlet) || 0))
  );

  // กราฟคลอรีน (เอา Error ออก)
  const ctx1 = document.getElementById('chlorineChart').getContext('2d');
  if (chlorineChartInstance) chlorineChartInstance.destroy();
  chlorineChartInstance = new Chart(ctx1, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'คลอรีนขาเข้า (mg/L)', data: chlorineIn, borderColor: 'blue', fill: false },
        { label: 'คลอรีนขาออก (mg/L)', data: chlorineOut, borderColor: 'red', fill: false }
        // ไม่ต้องใส่ Error แล้ว
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        title: { display: true, text: 'กราฟคลอรีน' }
      },
      scales: {
        x: { title: { display: true, text: 'เวลา (ชั่วโมง.นาที)' } },
        y: { title: { display: true, text: 'ค่าคลอรีน (mg/L)' } }
      }
    }
  });

  // กราฟอัตราการไหลน้ำ + อัตราการจ่ายคลอรีน
  const ctx2 = document.getElementById('flowChart').getContext('2d');
  if (flowChartInstance) flowChartInstance.destroy();
  flowChartInstance = new Chart(ctx2, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'อัตราการไหลน้ำ (m³/h)', data: flowWater, borderColor: 'green', fill: false },
        { label: 'อัตราการจ่ายคลอรีน (l/h)', data: flowChlorine, borderColor: 'purple', fill: false }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        title: { display: true, text: 'กราฟอัตราการไหลน้ำและอัตราการจ่ายคลอรีน' }
      },
      scales: {
        x: { title: { display: true, text: 'เวลา (ชั่วโมง.นาที)' } },
        y: { title: { display: true, text: 'ค่าตามหน่วย' } }
      }
    }
  });
}

// สำหรับ export รายเดือน (monthly)
fetch('/export/pdf/monthly', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: yourMonthlyDataArray })
})
.then(res => res.blob())
.then(blob => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ChlorineMinburiReport_Monthly.pdf';
  a.click();
  window.URL.revokeObjectURL(url);
});

fetch('/export/excel', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: yourDataArray, type: 'monthly' }) // เปลี่ยน type ตามที่เลือก
})
.then(res => res.blob())
.then(blob => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ChlorineMinburi Report Monthly.xlsx'; // ชื่อไฟล์นี้จะถูก override โดย header จาก server
  a.click();
  window.URL.revokeObjectURL(url);
});



