// ฟังก์ชันออกจากระบบ
function logout() {
  // ลบข้อมูล session/token จาก localStorage
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  
  // นำทางไปที่หน้า login
  window.location.href = 'login.html';
}

let currentData = [];
let chartInstance = null; // <-- ย้ายมาด้านบนสุด
let chlorineChartInstance = null;
let flowChartInstance = null;
let chlorineTotalChartInstance = null;
let chlorineStockChartInstance = null;
let chlorineLineChartInstance = null;
let chlorineLevelChartInstance = null;

// ช่วยคำนวณค่าสูงสุดที่แนะนำสำหรับแกน Y เพื่อเว้นช่องว่างด้านบน (เพิ่ม 10-20%)
function computeSuggestedMax(arr, factor = 1.15) {
  try {
    if (!Array.isArray(arr) || arr.length === 0) return undefined;
    const nums = arr.map(v => Number(v) || 0);
    const m = Math.max(...nums);
    if (!isFinite(m) || m <= 0) return undefined;
    return m * factor;
  } catch (e) {
    return undefined;
  }
}

// --- Year handling helpers (display BE to user, convert back to AD for requests) ---
function shownYearToAD(y) {
  // Accept numbers or strings; if looks like BE (>=2500) subtract 543
  const n = parseInt(String(y).trim(), 10);
  if (!isFinite(n)) return NaN;
  return n >= 2500 ? n - 543 : n;
}

function adToShownYear(ad) {
  const n = parseInt(String(ad).trim(), 10);
  if (!isFinite(n)) return '';
  return n + 543;
}

function getReport() {
  const type = document.getElementById('reportType').value;
  let date = '';
  let endDate = '';
  
  // ซ่อนกราฟเมื่อกดค้นหา
  const chartContainer = document.getElementById('chartContainer');
  const chartButton = document.querySelector('button[onclick="showChart()"]');
  if (chartContainer) {
    chartContainer.style.display = 'none';
  }
  if (chartButton) {
    chartButton.textContent = 'แสดงกราฟ';
  }
  
  if (type === 'daily') {
    let day = document.getElementById('reportDay').value;
    let month = document.getElementById('reportMonth').value;
    // year shown to user is BE (พ.ศ.) — convert to AD for requests
    let yearShown = document.getElementById('reportYear').value;
    const year = String(shownYearToAD(yearShown));
    day = day.padStart(2, '0');
    month = month.padStart(2, '0');
    date = `${year}-${month}-${day}`;
  } else if (type === 'monthly') {
    const month = document.getElementById('reportMonth').value;
    const yearShown = document.getElementById('reportYear').value;
    const year = String(shownYearToAD(yearShown));
    date = `${year}-${month.padStart(2, '0')}-01`;
  } else if (type === 'queryMonthly') {
    // Build start month/year
    let startMonth = document.getElementById('startMonth').value;
    let startYearShown = document.getElementById('startYear').value;
    let startYear = String(shownYearToAD(startYearShown));
    startMonth = startMonth.padStart(2, '0');
    date = `${startYear}-${startMonth}-01`;
    
    // Build end month/year
    let endMonth = document.getElementById('endMonth').value;
    let endYearShown = document.getElementById('endYear').value;
    let endYear = String(shownYearToAD(endYearShown));
    endMonth = endMonth.padStart(2, '0');
    endDate = `${endYear}-${endMonth}-01`;
    
    if (!date || !endDate) {
      alert("กรุณาเลือกเดือนเริ่มต้นและสิ้นสุด");
      return;
    }
    if (new Date(date) > new Date(endDate)) {
      alert("เดือนเริ่มต้นต้องน้อยกว่าหรือเท่ากับเดือนสิ้นสุด");
      return;
    }
  } else if (type === 'yearly') {
    const yearShown = document.getElementById('reportYear').value;
    date = String(shownYearToAD(yearShown));
  } else if (type === 'queryYearly') {
    // Build start year
    let startYearShown = document.getElementById('startYear').value;
    let startYear = String(shownYearToAD(startYearShown));
    date = startYear;
    
    // Build end year
    let endYearShown = document.getElementById('endYear').value;
    let endYear = String(shownYearToAD(endYearShown));
    endDate = endYear;
    
    if (!date || !endDate) {
      alert("กรุณาเลือกปีเริ่มต้นและสิ้นสุด");
      return;
    }
    if (parseInt(date) > parseInt(endDate)) {
      alert("ปีเริ่มต้นต้องน้อยกว่าหรือเท่ากับปีสิ้นสุด");
      return;
    }
  } else if (type === 'query') {
    // Build start date
    let startDay = document.getElementById('startDay').value;
    let startMonth = document.getElementById('startMonth').value;
    let startYearShown = document.getElementById('startYear').value;
    let startYear = String(shownYearToAD(startYearShown));
    startDay = startDay.padStart(2, '0');
    startMonth = startMonth.padStart(2, '0');
    date = `${startYear}-${startMonth}-${startDay}`;
    
    // Build end date
    let endDay = document.getElementById('endDay').value;
    let endMonthValue = document.getElementById('endMonth').value;
    let endYearShown = document.getElementById('endYear').value;
    let endYear = String(shownYearToAD(endYearShown));
    endDay = endDay.padStart(2, '0');
    endMonthValue = endMonthValue.padStart(2, '0');
    endDate = `${endYear}-${endMonthValue}-${endDay}`;
    
    if (!date || !endDate) {
      alert("กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด");
      return;
    }
    if (new Date(date) > new Date(endDate)) {
      alert("วันที่เริ่มต้นต้องน้อยกว่าหรือเท่ากับวันที่สิ้นสุด");
      return;
    }
  }

  if (!date || !type) {
    alert("กรุณาเลือกข้อมูลให้ครบถ้วน");
    return;
  }

  document.getElementById('showChartBtn').style.display = 'none'; // ซ่อนปุ่มก่อน

  console.log('Type:', type, 'Date:', date, 'EndDate:', endDate); // Debug log
  
  let url = `/ChlorineReport?date=${date}&type=${type}`;
  if ((type === 'query' || type === 'queryMonthly' || type === 'queryYearly') && endDate) {
    url += `&endDate=${endDate}`;
  }
  
  console.log('Fetching URL:', url); // Debug log
  
  fetch(url)
    .then(res => {
      console.log('Response status:', res.status); // Debug log
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      console.log('Received data:', data); // Debug log
      // เรียงข้อมูลตามวันที่และเวลา
      data.sort((a, b) => {
        // เรียงตามวันที่ก่อน
        const dateA = new Date(a.Date_Stamp || a.date || a.Date);
        const dateB = new Date(b.Date_Stamp || b.date || b.Date);
        
        if (dateA.getTime() !== dateB.getTime()) {
          return dateA.getTime() - dateB.getTime(); // เรียงจากน้อยไปมาก
        }
        
        // ถ้าวันที่เหมือนกัน ให้เรียงตามเวลา
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
    .catch(error => {
      console.error('Fetch error:', error);
      alert('โหลดข้อมูลล้มเหลว: ' + error.message);
    });
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

  if (type === 'daily' || type === 'query') {
    // หัวตาราง daily
    //<th rowspan="2">ลำดับ</th>
    thead.innerHTML = `
      <tr style="background:#2563eb;color:#fff;">
        
        <th rowspan="2">วันที่</th>
        <th rowspan="2">เวลา</th>
        <th colspan="2">คลอรีนอิสระคงเหลือ (mg/l)</th>

        <th rowspan="2">อัตราการเติมคลอรีน<br>Line1 (l/h)</th>
        <th rowspan="2">อัตราการเติมคลอรีน<br>Line2 (l/h)</th>
        <th rowspan="2">อัตราการเติมคลอรีน<br>Line3 (l/h)</th>

        <th rowspan="2">อัตราการไหลของน้ำขาเข้า<br>(m³/h)</th>
        <th rowspan="2">ระดับคลอรีนในถังเก็บ<br>(m)</th>
        <th rowspan="2">ปริมาณคลอรีนในถังเก็บ<br>(Litr)</th>
        <th rowspan="2">อัตราการจ่ายคลอรีนรวม<br>(l/h)</th>
        <th rowspan="2">ปริมาณการใช้คลอรีน<br>รายชั่วโมง (Litr)</th> <!-- เพิ่มตรงนี้ -->
      </tr>
      <tr style="background:#2563eb;color:#fff;">
        <th>ขาเข้าสถานี</th>
        <th>ขาออกสถานี</th>
      </tr>
    `;

    // เติมข้อมูลแบบ daily
    //<td>${i + 1}</td>
    data.forEach((row, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        
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
        <td>${row.MB_Chlorine_Inlet?.toFixed?.(2) ?? '-'}</td>
        <td>${row.MB_Chlorine_Outlet?.toFixed?.(2) ?? '-'}</td>

        <td>${row.MB_Flow_Chlorine_Line1?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.MB_Flow_Chlorine_Line2?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.MB_Flow_Chlorine_Line3?.toLocaleString?.(2) ?? '-'}</td>

        <td>${row.MB_Flow_Water_Inlet?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.MB_Level_Chlorine_Tank?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.MB_Volume_Chlorine_Tank?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.MB_Total_Flow_Chlorine?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.Chlorine_Per_Hour?.toLocaleString?.(2) ?? '-'}</td> <!-- เพิ่มตรงนี้ -->
      `;
      tbody.appendChild(tr);
    });
  } else if (type === 'monthly' || type === 'queryMonthly') {
    // หัวตาราง monthly
    //<th rowspan="2">ลำดับ</th>
    thead.innerHTML = `
      <tr style="background:#2563eb;color:#fff;">
        
        <th rowspan="2">วันที่</th>
        <th colspan="2">คลอรีนอิสระคงเหลือ (mg/l)</th>

        <th rowspan="2">อัตราการเติมคลอรีน<br>Line1 (l/h)</th>
        <th rowspan="2">อัตราการเติมคลอรีน<br>Line2 (l/h)</th>
        <th rowspan="2">อัตราการเติมคลอรีน<br>Line3 (l/h)</th>

        <th rowspan="2">อัตราการไหลของน้ำขาเข้า<br>(m³/h)</th>
        <th rowspan="2">ระดับคลอรีนในถังเก็บ<br>(m)</th>
        <th rowspan="2">ปริมาณคลอรีนในถังเก็บ<br>(Litr)</th>
        <th rowspan="2">อัตราการจ่ายคลอรีนรวม<br>(l/h)</th>
        <th rowspan="2">ปริมาณการใช้คลอรีน<br>รายวัน (Litr)</th> <!-- เพิ่มตรงนี้ -->
      </tr>
      <tr style="background:#2563eb;color:#fff;">
        <th>ขาเข้าสถานี</th>
        <th>ขาออกสถานี</th>
      </tr>
    `;

    // เติมข้อมูลแบบ monthly
    //<td>${i + 1}</td>
    data.forEach((row, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        
        <td>${
          row.Date_Stamp
            ? new Date(row.Date_Stamp).toLocaleDateString('th-TH')
            : '-'
        }</td>
        <td>${row.MB_Chlorine_Inlet?.toFixed?.(2) ?? '-'}</td>
        <td>${row.MB_Chlorine_Outlet?.toFixed?.(2) ?? '-'}</td>

        <td>${row.MB_Flow_Chlorine_Line1?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.MB_Flow_Chlorine_Line2?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.MB_Flow_Chlorine_Line3?.toLocaleString?.(2) ?? '-'}</td>

        <td>${row.MB_Flow_Water_Inlet?.toLocaleString?.() ?? '-'}</td>
        <td>${row.MB_Level_Chlorine_Tank?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.MB_Volume_Chlorine_Tank?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.MB_Total_Flow_Chlorine?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.Chlorine_Per_Day?.toLocaleString?.(2) ?? '-'}</td> <!-- เพิ่มตรงนี้ -->
      `;
      tbody.appendChild(tr);
    });
  } else if (type === 'yearly' || type === 'queryYearly') {
    //<th rowspan="2">ลำดับ</th>
thead.innerHTML = `
  <tr style="background:#2563eb;color:#fff;">
    
    <th rowspan="2">เดือน</th>
    <th rowspan="2">ปี</th>
    <th colspan="2">คลอรีนอิสระคงเหลือ (mg/l)</th>

    <th rowspan="2">อัตราการเติมคลอรีน<br>Line1 (l/h)</th>
    <th rowspan="2">อัตราการเติมคลอรีน<br>Line2 (l/h)</th>
    <th rowspan="2">อัตราการเติมคลอรีน<br>Line3 (l/h)</th>

    <th rowspan="2">อัตราการไหลของน้ำขาเข้า<br>(m³/h)</th>
    <th rowspan="2">ระดับคลอรีนในถังเก็บ<br>(m)</th>
    <th rowspan="2">ปริมาณคลอรีนในถังเก็บ<br>(Litr)</th>
    <th rowspan="2">อัตราการจ่ายคลอรีนรวม<br>(l/h)</th>
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
    //<td>${i + 1}</td>
    tr.innerHTML = `
      
    
      <td>${row.Month_?.toFixed?.(0) ?? '-'}</td>
      <td>${row.Year_?.toFixed?.(0) ?? '-'}</td>
        <td>${row.MB_Chlorine_Inlet?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.MB_Chlorine_Outlet?.toFixed?.(2) ?? '-'}</td>

        <td>${row.MB_Flow_Chlorine_Line1?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.MB_Flow_Chlorine_Line2?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.MB_Flow_Chlorine_Line3?.toLocaleString?.(2) ?? '-'}</td>

        <td>${row.MB_Flow_Water_Inlet?.toLocaleString?.() ?? '-'}</td>
        <td>${row.MB_Level_Chlorine_Tank?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.MB_Volume_Chlorine_Tank?.toLocaleString?.(2) ?? '-'}</td>
        <td>${row.MB_Total_Flow_Chlorine?.toLocaleString?.(2) ?? '-'}</td>
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
    { key: 'MB_Chlorine_Inlet', label: 'คลอรีนอิสระคงเหลือ<br>ขาเข้าสถานี (mg/l)' },
    { key: 'MB_Chlorine_Outlet', label: 'คลอรีนอิสระคงเหลือ<br>ขาออกสถานี (mg/l)' },
    { key: 'MB_Flow_Chlorine_Line1', label: 'อัตราการเติมคลอรีน<br>Line1 (l/h)' },
    { key: 'MB_Flow_Chlorine_Line2', label: 'อัตราการเติมคลอรีน<br>Line2 (l/h)' },
    { key: 'MB_Flow_Chlorine_Line3', label: 'อัตราการเติมคลอรีน<br>Line3 (l/h)' },
    { key: 'MB_Flow_Water_Inlet', label: 'อัตราการไหลของน้ำขาเข้า<br>(m³)' },
    { key: 'MB_Total_Flow_Chlorine', label: 'อัตราการจ่ายคลอรีนรวม<br>(l/h)' },


    /*{ key: 'MB_Level_Chlorine_Tank', label: 'ระดับคลอรีนในถัง (m)' },
    { key: 'MB_Volume_Chlorine_Tank', label: 'ปริมาณคลอรีนในถัง (Litr)' },
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

// สำหรับ Query modes ให้แสดงข้อมูลแบบละเอียด (สูงสุด, ต่ำสุด, เฉลี่ย, ผลรวม)
const isQueryMode = (type === 'query' || type === 'queryMonthly' || type === 'queryYearly');

if (type === 'daily' || type === 'query') {
  totalSummary = [
    { key: 'Chlorine_Per_Hour', label: 'ปริมาณการจ่ายคลอรีนรวมทั้งวัน (Litr)' },
    { key: 'MB_Flow_Water_Inlet', label: 'ปริมาณน้ำขาเข้ารวมทั้งวัน (m³)' },
  ];
} else if (type === 'monthly' || type === 'queryMonthly') {
  totalSummary = [
    { key: 'Chlorine_Per_Day', label: 'ปริมาณการจ่ายคลอรีนรวมทั้งเดือน (Litr)' },
    { key: 'MB_Flow_Water_Inlet', label: 'ปริมาณน้ำขาเข้ารวมทั้งเดือน (m³)' },
  ];
} else if (type === 'yearly' || type === 'queryYearly') {
  totalSummary = [
    { key: 'Chlorine_Per_Month', label: 'ปริมาณการจ่ายคลอรีนรวมทั้งปี (Litr)' },
    { key: 'MB_Flow_Water_Inlet', label: 'ปริมาณน้ำขาเข้ารวมทั้งปี (m³)' },
  ];
}

let totalHTML = '';
totalHTML = `<table class="styled-table" style="margin-top:1rem;max-width:600px;">
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
  const typeMap = { 
    daily: 'Daily', 
    monthly: 'Monthly', 
    yearly: 'Yearly', 
    query: 'QueryDaily', 
    queryMonthly: 'QueryMonthly', 
    queryYearly: 'QueryYearly' 
  };

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
      a.download = `ChlorineReport_${typeMap[type] || 'Report'}.xlsx`;
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
  if (type === 'monthly' || type === 'queryMonthly') url = '/export/pdf/monthly';
  else if (type === 'yearly' || type === 'queryYearly') url = '/export/pdf/yearly';
  else if (type === 'query') url = '/export/pdf'; // Query date ใช้ template เดียวกับ daily
  const typeMap = { 
    daily: 'Daily', 
    monthly: 'Monthly', 
    yearly: 'Yearly', 
    query: 'QueryDaily', 
    queryMonthly: 'QueryMonthly', 
    queryYearly: 'QueryYearly' 
  };

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
      a.download = `ChlorineReport_${typeMap[type] || 'Report'}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    })
    .catch(() => alert('Export PDF ล้มเหลว'));
}

function showChart() {
  const type = document.getElementById('reportType').value;
  const data = currentData;

  if (!data || data.length === 0) {
    alert('ไม่มีข้อมูลสำหรับแสดงกราฟ');
    return;
  }

  // Toggle แสดง/ซ่อนกราฟ container
  const chartContainer = document.getElementById('chartContainer');
  const chartButton = document.querySelector('button[onclick="showChart()"]');
  
  if (chartContainer.style.display === 'grid') {
    // ถ้ากราฟกำลังแสดงอยู่ ให้ซ่อน
    chartContainer.style.display = 'none';
    if (chartButton) chartButton.textContent = 'แสดงกราฟ';
    return;
  }
  
  // แสดงกราฟ container
  chartContainer.style.display = 'grid';
  if (chartButton) chartButton.textContent = 'ซ่อนกราฟ';

  let labels, chlorineIn, chlorineOut, flowData, chlorineTotalData, chlorineStockData;
  let line1Data, line2Data, line3Data, chlorineLevelData;

  if (type === 'yearly' || type === 'queryYearly') {
    // Yearly: แสดงเดือนและปี (เช่น "ม.ค./68")
    console.log('🔍 Yearly Data:', data[0]); // Debug
    let rawYear = data[0]?.Year_ || data[0]?.year;

    // ถ้าไม่มีปีในข้อมูล ให้ดึงจาก input (input แสดงเป็น BE)
    if (!rawYear) {
      const yearInput = document.getElementById('reportYear') || document.getElementById('startYear');
      rawYear = yearInput ? parseInt(yearInput.value, 10) : new Date().getFullYear();
    }

    const rawYearNum = parseInt(rawYear, 10);
    // ถ้า rawYear ดูเหมือนเป็น BE (>=2500) ให้ใช้ตรงๆ, ถ้าเป็น AD ให้ +543
    const beYear = (rawYearNum >= 2500) ? rawYearNum : (rawYearNum + 543);
    console.log('🔍 Year Value (raw):', rawYearNum, ' -> BE:', beYear); // Debug
    const thaiYear = String(beYear).slice(-2); // เอาแค่ 2 หลักท้าย เช่น 2568 -> 68
    console.log('🔍 Thai Year:', thaiYear); // Debug
    
    labels = [
      `ม.ค./${thaiYear}`, `ก.พ./${thaiYear}`, `มี.ค./${thaiYear}`, `เม.ย./${thaiYear}`, 
      `พ.ค./${thaiYear}`, `มิ.ย./${thaiYear}`, `ก.ค./${thaiYear}`, `ส.ค./${thaiYear}`, 
      `ก.ย./${thaiYear}`, `ต.ค./${thaiYear}`, `พ.ย./${thaiYear}`, `ธ.ค./${thaiYear}`
    ];
    chlorineIn = Array(12).fill(0);
    chlorineOut = Array(12).fill(0);
    flowData = Array(12).fill(0);
    chlorineTotalData = Array(12).fill(0);
    chlorineStockData = Array(12).fill(0);
    line1Data = Array(12).fill(0);
    line2Data = Array(12).fill(0);
    line3Data = Array(12).fill(0);
    chlorineLevelData = Array(12).fill(0);

    data.forEach(row => {
      const month = (row.Month_ || row.month || 0) - 1;
      if (month >= 0 && month < 12) {
        chlorineIn[month] = Number(row.MB_Chlorine_Inlet) || 0;
        chlorineOut[month] = Number(row.MB_Chlorine_Outlet) || 0;
        flowData[month] = Number(row.MB_Flow_Water_Inlet) || 0;
        chlorineTotalData[month] = Number(row.MB_Total_Flow_Chlorine) || 0;
        chlorineStockData[month] = Number(row.MB_Volume_Chlorine_Tank) || 0;
        line1Data[month] = Number(row.MB_Flow_Chlorine_Line1) || 0;
        line2Data[month] = Number(row.MB_Flow_Chlorine_Line2) || 0;
        line3Data[month] = Number(row.MB_Flow_Chlorine_Line3) || 0;
        chlorineLevelData[month] = Number(row.MB_Level_Chlorine_Tank) || 0;
      }
    });
  } else if (type === 'monthly') {
    // Monthly: แสดงวันที่และเดือน (เช่น "1 ม.ค.")
    const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    labels = data.map(row => {
      const date = new Date(row.Date_Stamp);
      const day = date.getDate();
      const month = monthNames[date.getMonth()];
      return `${day} ${month}`;
    });
    chlorineIn = data.map(row => Number(row.MB_Chlorine_Inlet));
    chlorineOut = data.map(row => Number(row.MB_Chlorine_Outlet));
    flowData = data.map(row => Number(row.MB_Flow_Water_Inlet));
    chlorineTotalData = data.map(row => Number(row.MB_Total_Flow_Chlorine));
    chlorineStockData = data.map(row => Number(row.MB_Volume_Chlorine_Tank));
    line1Data = data.map(row => Number(row.MB_Flow_Chlorine_Line1));
    line2Data = data.map(row => Number(row.MB_Flow_Chlorine_Line2));
    line3Data = data.map(row => Number(row.MB_Flow_Chlorine_Line3));
    chlorineLevelData = data.map(row => Number(row.MB_Level_Chlorine_Tank));
  } else {
    // Daily/Query: แสดงวันที่และเวลา (เช่น "22/10 08:00")
    labels = data.map(row => {
      const date = new Date(row.Date_Stamp);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const time = row.Time_Stamp || '';
      return `${day}/${month} ${time}`;
    });
    chlorineIn = data.map(row => Number(row.MB_Chlorine_Inlet));
    chlorineOut = data.map(row => Number(row.MB_Chlorine_Outlet));
    flowData = data.map(row => Number(row.MB_Flow_Water_Inlet));
    chlorineTotalData = data.map(row => Number(row.MB_Total_Flow_Chlorine));
    chlorineStockData = data.map(row => Number(row.MB_Volume_Chlorine_Tank));
    line1Data = data.map(row => Number(row.MB_Flow_Chlorine_Line1));
    line2Data = data.map(row => Number(row.MB_Flow_Chlorine_Line2));
    line3Data = data.map(row => Number(row.MB_Flow_Chlorine_Line3));
    chlorineLevelData = data.map(row => Number(row.MB_Level_Chlorine_Tank));
  }

  // Debug: ตรวจสอบข้อมูลก่อนสร้างกราฟ
        console.log('📊 Chart Data Debug:');
        console.log('Labels:', labels);
        console.log('Chlorine In:', chlorineIn);
        console.log('Chlorine Out:', chlorineOut);
        console.log('Flow Data:', flowData);
        console.log('Chlorine Total Data:', chlorineTotalData);
        console.log('Chlorine Stock Data:', chlorineStockData);
        console.log('Line 1 Data:', line1Data);
        console.log('Line 2 Data:', line2Data);
        console.log('Line 3 Data:', line3Data);
        console.log('Sample Data Row:', data[0]);
        console.log('🔍 Available Fields in Data:', Object.keys(data[0]));
        console.log('🔍 MB_Volume_Chlorine_Tank value:', data[0].MB_Volume_Chlorine_Tank);
        console.log('🔍 First 5 rows MB_Volume_Chlorine_Tank:', data.slice(0, 5).map(row => ({
          time: row.Time_Stamp,
          volume: row.MB_Volume_Chlorine_Tank
        })));  // กราฟ 1: คลอรีนอิสระคงเหลือ
  const ctx = document.getElementById('chlorineChart').getContext('2d');
  if (window.chlorineChartInstance) window.chlorineChartInstance.destroy();
  const chlorineSuggestedMax = computeSuggestedMax(chlorineIn, 1.15);
  window.chlorineChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { 
          label: 'คลอรีนขาเข้า', 
          data: chlorineIn, 
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 2
        },
        { 
          label: 'คลอรีนขาออก', 
          data: chlorineOut, 
          borderColor: '#dc2626',
          backgroundColor: 'rgba(220, 38, 38, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          min: 0,
          suggestedMax: chlorineSuggestedMax,
          title: {
            display: true,
            text: 'mg/l',
            font: {
              size: 14,
              weight: 'bold'
            }
          }
        }
      }
    }
  });

  // กราฟ 2: อัตราการไหลของน้ำ (แยกออกมา)
  const flowCtx = document.getElementById('flowChart').getContext('2d');
  if (window.flowChartInstance) window.flowChartInstance.destroy();
  const flowSuggestedMax = computeSuggestedMax(flowData, 1.15);
  window.flowChartInstance = new Chart(flowCtx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { 
          label: 'อัตราการไหลน้ำขาเข้า', 
          data: flowData, 
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          min: 0,
          suggestedMax: flowSuggestedMax,
          title: {
            display: true,
            text: 'm³/h',
            font: {
              size: 14,
              weight: 'bold'
            }
          }
        }
      }
    }
  });

  // กราฟ 3: อัตราการจ่ายคลอรีนรวม (แยกออกมา)
  const chlorineTotalCtx = document.getElementById('chlorineTotalChart').getContext('2d');
  if (window.chlorineTotalChartInstance) window.chlorineTotalChartInstance.destroy();
  const chlorineTotalSuggestedMax = computeSuggestedMax(chlorineTotalData, 1.15);
  window.chlorineTotalChartInstance = new Chart(chlorineTotalCtx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { 
          label: 'อัตราการจ่ายคลอรีนรวม', 
          data: chlorineTotalData, 
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          min: 0,
          suggestedMax: chlorineTotalSuggestedMax,
          title: {
            display: true,
            text: 'l/h',
            font: {
              size: 14,
              weight: 'bold'
            }
          }
        }
      }
    }
  });

  // กราฟ 4: อัตราการเติมคลอรีน Line 1, 2, 3
  const chlorineLineCtx = document.getElementById('chlorineLineChart').getContext('2d');
  if (window.chlorineLineChartInstance) window.chlorineLineChartInstance.destroy();
  const chlorineLineSuggestedMax = computeSuggestedMax([].concat(line1Data, line2Data, line3Data), 1.15);
  window.chlorineLineChartInstance = new Chart(chlorineLineCtx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { 
          label: 'Line 1', 
          data: line1Data, 
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 2
        },
        { 
          label: 'Line 2', 
          data: line2Data, 
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 2
        },
        { 
          label: 'Line 3', 
          data: line3Data, 
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          min: 0,
          suggestedMax: chlorineLineSuggestedMax,
          title: {
            display: true,
            text: 'l/h',
            font: {
              size: 14,
              weight: 'bold'
            }
          }
        }
      }
    }
  });

  // กราฟ 5: ปริมาณคลอรีนในถังเก็บ
  const chlorineStockCtx = document.getElementById('chlorineStockChart').getContext('2d');
  if (window.chlorineStockChartInstance) window.chlorineStockChartInstance.destroy();
  const chlorineStockSuggestedMax = computeSuggestedMax(chlorineStockData, 1.15);
  window.chlorineStockChartInstance = new Chart(chlorineStockCtx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { 
          label: 'ปริมาณคลอรีนในถังเก็บ', 
          data: chlorineStockData, 
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          borderColor: '#8b5cf6',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#8b5cf6',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        annotation: {
          annotations: {
            line1: {
              type: 'line',
              yMin: 20000,
              yMax: 20000,
              borderColor: 'red',
              borderWidth: 2,
              borderDash: [5, 5],
              label: {
                display: true,
                content: 'เกณฑ์ 20,000 ลิตร',
                position: 'end',
                backgroundColor: 'rgba(255, 0, 0, 0.8)',
                color: 'white',
                font: {
                  size: 11,
                  weight: 'bold'
                },
                padding: 4
              }
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          min: 0,
          // กำหนดค่า max ตายตัวตามคำร้องขอ
          max: 45000,
          title: {
            display: true,
            text: 'Litr',
            font: {
              size: 14,
              weight: 'bold'
            }
          }
        }
      }
    }
  });
}

function updateDateInput() {
  const type = document.getElementById('reportType').value;
  const group = document.getElementById('dateInputGroup');
  const today = new Date();
  
  // ซ่อนกราฟเมื่อเปลี่ยนโหมด
  const chartContainer = document.getElementById('chartContainer');
  const chartButton = document.querySelector('button[onclick="showChart()"]');
  if (chartContainer) {
    chartContainer.style.display = 'none';
  }
  if (chartButton) {
    chartButton.textContent = 'แสดงกราฟ';
  }
  
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
          <option value="1" ${today.getMonth() + 1 === 1 ? 'selected' : ''}>ม.ค.</option>
          <option value="2" ${today.getMonth() + 1 === 2 ? 'selected' : ''}>ก.พ.</option>
          <option value="3" ${today.getMonth() + 1 === 3 ? 'selected' : ''}>มี.ค.</option>
          <option value="4" ${today.getMonth() + 1 === 4 ? 'selected' : ''}>เม.ย.</option>
          <option value="5" ${today.getMonth() + 1 === 5 ? 'selected' : ''}>พ.ค.</option>
          <option value="6" ${today.getMonth() + 1 === 6 ? 'selected' : ''}>มิ.ย.</option>
          <option value="7" ${today.getMonth() + 1 === 7 ? 'selected' : ''}>ก.ค.</option>
          <option value="8" ${today.getMonth() + 1 === 8 ? 'selected' : ''}>ส.ค.</option>
          <option value="9" ${today.getMonth() + 1 === 9 ? 'selected' : ''}>ก.ย.</option>
          <option value="10" ${today.getMonth() + 1 === 10 ? 'selected' : ''}>ต.ค.</option>
          <option value="11" ${today.getMonth() + 1 === 11 ? 'selected' : ''}>พ.ย.</option>
          <option value="12" ${today.getMonth() + 1 === 12 ? 'selected' : ''}>ธ.ค.</option>
        </select>
      </label>
      <label>ปี:
        <input type="number" id="reportYear" min="${adToShownYear(2000)}" max="${adToShownYear(2100)}" value="${adToShownYear(today.getFullYear())}">
      </label>
    `;
    // อัปเดตจำนวนวันตามเดือน/ปี
    function updateDays() {
      const month = parseInt(document.getElementById('reportMonth').value, 10);
      // reportYear shown as BE -> convert to AD for leap-year logic
      const year = parseInt(String(shownYearToAD(document.getElementById('reportYear').value)), 10);
      const daySelect = document.getElementById('reportDay');
      const selectedDay = parseInt(daySelect.value, 10) || today.getDate(); // เก็บวันที่เลือกไว้
      let days = 31;
      if ([4, 6, 9, 11].includes(month)) days = 30;
      else if (month === 2) {
        // เช็คปีอธิกสุรทิน
        days = ((year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)) ? 29 : 28;
      }
      daySelect.innerHTML = Array.from({length: days}, (_, i) => 
        `<option value="${i+1}" ${i+1 === (selectedDay <= days ? selectedDay : days) ? 'selected' : ''}>${i+1}</option>`
      ).join('');
    }
    updateDays(); // เรียกฟังก์ชันอัปเดตจำนวนวัน

    // เพิ่ม event listener เมื่อเปลี่ยนเดือนหรือปี
    document.getElementById('reportMonth').addEventListener('change', updateDays);
    document.getElementById('reportYear').addEventListener('change', updateDays);
  } else if (type === 'monthly') {
    group.innerHTML = `
      <label>เดือน:
        <select id="reportMonth">
          <option value="1" ${today.getMonth() + 1 === 1 ? 'selected' : ''}>มกราคม</option>
          <option value="2" ${today.getMonth() + 1 === 2 ? 'selected' : ''}>กุมภาพันธ์</option>
          <option value="3" ${today.getMonth() + 1 === 3 ? 'selected' : ''}>มีนาคม</option>
          <option value="4" ${today.getMonth() + 1 === 4 ? 'selected' : ''}>เมษายน</option>
          <option value="5" ${today.getMonth() + 1 === 5 ? 'selected' : ''}>พฤษภาคม</option>
          <option value="6" ${today.getMonth() + 1 === 6 ? 'selected' : ''}>มิถุนายน</option>
          <option value="7" ${today.getMonth() + 1 === 7 ? 'selected' : ''}>กรกฎาคม</option>
          <option value="8" ${today.getMonth() + 1 === 8 ? 'selected' : ''}>สิงหาคม</option>
          <option value="9" ${today.getMonth() + 1 === 9 ? 'selected' : ''}>กันยายน</option>
          <option value="10" ${today.getMonth() + 1 === 10 ? 'selected' : ''}>ตุลาคม</option>
          <option value="11" ${today.getMonth() + 1 === 11 ? 'selected' : ''}>พฤศจิกายน</option>
          <option value="12" ${today.getMonth() + 1 === 12 ? 'selected' : ''}>ธันวาคม</option>
        </select>
      </label>
  <label>ปี: <input type="number" id="reportYear" min="${adToShownYear(2000)}" max="${adToShownYear(2100)}" value="${adToShownYear(today.getFullYear())}"></label>
    `;
  } else if (type === 'queryMonthly') {
    group.innerHTML = `
      <div style="display: flex; gap: 1rem; align-items: center;">
        <div>
          <strong>เดือนเริ่มต้น:</strong>
          <label>เดือน:
            <select id="startMonth">
              <option value="1" ${today.getMonth() + 1 === 1 ? 'selected' : ''}>ม.ค.</option>
              <option value="2" ${today.getMonth() + 1 === 2 ? 'selected' : ''}>ก.พ.</option>
              <option value="3" ${today.getMonth() + 1 === 3 ? 'selected' : ''}>มี.ค.</option>
              <option value="4" ${today.getMonth() + 1 === 4 ? 'selected' : ''}>เม.ย.</option>
              <option value="5" ${today.getMonth() + 1 === 5 ? 'selected' : ''}>พ.ค.</option>
              <option value="6" ${today.getMonth() + 1 === 6 ? 'selected' : ''}>มิ.ย.</option>
              <option value="7" ${today.getMonth() + 1 === 7 ? 'selected' : ''}>ก.ค.</option>
              <option value="8" ${today.getMonth() + 1 === 8 ? 'selected' : ''}>ส.ค.</option>
              <option value="9" ${today.getMonth() + 1 === 9 ? 'selected' : ''}>ก.ย.</option>
              <option value="10" ${today.getMonth() + 1 === 10 ? 'selected' : ''}>ต.ค.</option>
              <option value="11" ${today.getMonth() + 1 === 11 ? 'selected' : ''}>พ.ย.</option>
              <option value="12" ${today.getMonth() + 1 === 12 ? 'selected' : ''}>ธ.ค.</option>
            </select>
          </label>
          <label>ปี: <input type="number" id="startYear" min="${adToShownYear(2000)}" max="${adToShownYear(2100)}" value="${adToShownYear(today.getFullYear())}" style="width: 45px;"></label>
        </div>
        <div>
          <strong>เดือนสิ้นสุด:</strong>
          <label>เดือน:
            <select id="endMonth">
              <option value="1" ${today.getMonth() + 1 === 1 ? 'selected' : ''}>ม.ค.</option>
              <option value="2" ${today.getMonth() + 1 === 2 ? 'selected' : ''}>ก.พ.</option>
              <option value="3" ${today.getMonth() + 1 === 3 ? 'selected' : ''}>มี.ค.</option>
              <option value="4" ${today.getMonth() + 1 === 4 ? 'selected' : ''}>เม.ย.</option>
              <option value="5" ${today.getMonth() + 1 === 5 ? 'selected' : ''}>พ.ค.</option>
              <option value="6" ${today.getMonth() + 1 === 6 ? 'selected' : ''}>มิ.ย.</option>
              <option value="7" ${today.getMonth() + 1 === 7 ? 'selected' : ''}>ก.ค.</option>
              <option value="8" ${today.getMonth() + 1 === 8 ? 'selected' : ''}>ส.ค.</option>
              <option value="9" ${today.getMonth() + 1 === 9 ? 'selected' : ''}>ก.ย.</option>
              <option value="10" ${today.getMonth() + 1 === 10 ? 'selected' : ''}>ต.ค.</option>
              <option value="11" ${today.getMonth() + 1 === 11 ? 'selected' : ''}>พ.ย.</option>
              <option value="12" ${today.getMonth() + 1 === 12 ? 'selected' : ''}>ธ.ค.</option>
            </select>
          </label>
          <label>ปี: <input type="number" id="endYear" min="${adToShownYear(2000)}" max="${adToShownYear(2100)}" value="${adToShownYear(today.getFullYear())}" style="width: 45px;"></label>
        </div>
      </div>
    `;
  } else if (type === 'yearly') {
  group.innerHTML = `<label>ปี: <input type="number" id="reportYear" min="${adToShownYear(2000)}" max="${adToShownYear(2100)}" value="${adToShownYear(today.getFullYear())}"></label>`;
  } else if (type === 'queryYearly') {
    group.innerHTML = `
      <div style="display: flex; gap: 1rem; align-items: center;">
        <div>
          <strong>ปีเริ่มต้น:</strong>
          <label>ปี: <input type="number" id="startYear" min="${adToShownYear(2000)}" max="${adToShownYear(2100)}" value="${adToShownYear(today.getFullYear())}" style="width: 60px;"></label>
        </div>
        <div>
          <strong>ปีสิ้นสุด:</strong>
          <label>ปี: <input type="number" id="endYear" min="${adToShownYear(2000)}" max="${adToShownYear(2100)}" value="${adToShownYear(today.getFullYear())}" style="width: 60px;"></label>
        </div>
      </div>
    `;
  } else if (type === 'query') {
    group.innerHTML = `
      <div style="display: flex; gap: 1rem; align-items: center;">
        <div>
          <strong>วันที่เริ่มต้น:</strong>
          <label>วัน: <select id="startDay"></select></label>
          <label>เดือน:
            <select id="startMonth">
              <option value="1" ${today.getMonth() + 1 === 1 ? 'selected' : ''}>ม.ค.</option>
              <option value="2" ${today.getMonth() + 1 === 2 ? 'selected' : ''}>ก.พ.</option>
              <option value="3" ${today.getMonth() + 1 === 3 ? 'selected' : ''}>มี.ค.</option>
              <option value="4" ${today.getMonth() + 1 === 4 ? 'selected' : ''}>เม.ย.</option>
              <option value="5" ${today.getMonth() + 1 === 5 ? 'selected' : ''}>พ.ค.</option>
              <option value="6" ${today.getMonth() + 1 === 6 ? 'selected' : ''}>มิ.ย.</option>
              <option value="7" ${today.getMonth() + 1 === 7 ? 'selected' : ''}>ก.ค.</option>
              <option value="8" ${today.getMonth() + 1 === 8 ? 'selected' : ''}>ส.ค.</option>
              <option value="9" ${today.getMonth() + 1 === 9 ? 'selected' : ''}>ก.ย.</option>
              <option value="10" ${today.getMonth() + 1 === 10 ? 'selected' : ''}>ต.ค.</option>
              <option value="11" ${today.getMonth() + 1 === 11 ? 'selected' : ''}>พ.ย.</option>
              <option value="12" ${today.getMonth() + 1 === 12 ? 'selected' : ''}>ธ.ค.</option>
            </select>
          </label>
          <label>ปี: <input type="number" id="startYear" min="${adToShownYear(2000)}" max="${adToShownYear(2100)}" value="${adToShownYear(today.getFullYear())}" style="width: 45px;"></label>
        </div>
        <div>
          <strong>วันที่สิ้นสุด:</strong>
          <label>วัน: <select id="endDay"></select></label>
          <label>เดือน:
            <select id="endMonth">
              <option value="1" ${today.getMonth() + 1 === 1 ? 'selected' : ''}>ม.ค.</option>
              <option value="2" ${today.getMonth() + 1 === 2 ? 'selected' : ''}>ก.พ.</option>
              <option value="3" ${today.getMonth() + 1 === 3 ? 'selected' : ''}>มี.ค.</option>
              <option value="4" ${today.getMonth() + 1 === 4 ? 'selected' : ''}>เม.ย.</option>
              <option value="5" ${today.getMonth() + 1 === 5 ? 'selected' : ''}>พ.ค.</option>
              <option value="6" ${today.getMonth() + 1 === 6 ? 'selected' : ''}>มิ.ย.</option>
              <option value="7" ${today.getMonth() + 1 === 7 ? 'selected' : ''}>ก.ค.</option>
              <option value="8" ${today.getMonth() + 1 === 8 ? 'selected' : ''}>ส.ค.</option>
              <option value="9" ${today.getMonth() + 1 === 9 ? 'selected' : ''}>ก.ย.</option>
              <option value="10" ${today.getMonth() + 1 === 10 ? 'selected' : ''}>ต.ค.</option>
              <option value="11" ${today.getMonth() + 1 === 11 ? 'selected' : ''}>พ.ย.</option>
              <option value="12" ${today.getMonth() + 1 === 12 ? 'selected' : ''}>ธ.ค.</option>
            </select>
          </label>
          <label>ปี: <input type="number" id="endYear" min="${adToShownYear(2000)}" max="${adToShownYear(2100)}" value="${adToShownYear(today.getFullYear())}" style="width: 45px;"></label>
        </div>
      </div>
    `;
    
    // Function to update days for both start and end date
    function updateQueryDays() {
      // Update start date days
  const startMonth = parseInt(document.getElementById('startMonth').value, 10);
  const startYear = parseInt(String(shownYearToAD(document.getElementById('startYear').value)), 10);
      const startDaySelect = document.getElementById('startDay');
      const selectedStartDay = parseInt(startDaySelect.value, 10) || today.getDate(); // เก็บวันที่เลือกไว้
      let startDays = 31;
      if ([4, 6, 9, 11].includes(startMonth)) startDays = 30;
      else if (startMonth === 2) {
        startDays = ((startYear % 4 === 0 && startYear % 100 !== 0) || (startYear % 400 === 0)) ? 29 : 28;
      }
      startDaySelect.innerHTML = Array.from({length: startDays}, (_, i) => 
        `<option value="${i+1}" ${i+1 === (selectedStartDay <= startDays ? selectedStartDay : startDays) ? 'selected' : ''}>${i+1}</option>`
      ).join('');
      
      // Update end date days
  const endMonth = parseInt(document.getElementById('endMonth').value, 10);
  const endYear = parseInt(String(shownYearToAD(document.getElementById('endYear').value)), 10);
      const endDaySelect = document.getElementById('endDay');
      const selectedEndDay = parseInt(endDaySelect.value, 10) || today.getDate(); // เก็บวันที่เลือกไว้
      let endDays = 31;
      if ([4, 6, 9, 11].includes(endMonth)) endDays = 30;
      else if (endMonth === 2) {
        endDays = ((endYear % 4 === 0 && endYear % 100 !== 0) || (endYear % 400 === 0)) ? 29 : 28;
      }
      endDaySelect.innerHTML = Array.from({length: endDays}, (_, i) => 
        `<option value="${i+1}" ${i+1 === (selectedEndDay <= endDays ? selectedEndDay : endDays) ? 'selected' : ''}>${i+1}</option>`
      ).join('');
    }
    
    updateQueryDays(); // Initialize days
    
    // Add event listeners
    document.getElementById('startMonth').addEventListener('change', updateQueryDays);
    document.getElementById('startYear').addEventListener('change', updateQueryDays);
    document.getElementById('endMonth').addEventListener('change', updateQueryDays);
    document.getElementById('endYear').addEventListener('change', updateQueryDays);
  } else if (type === 'queryMonthly') {
    group.innerHTML = `
      <div style="display: flex; gap: 1rem; align-items: center;">
        <div>
          <strong>เดือนเริ่มต้น:</strong>
          <label>เดือน:
            <select id="startMonthQuery">
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
          <label>ปี: <input type="number" id="startYearQuery" min="${adToShownYear(2000)}" max="${adToShownYear(2100)}" value="${adToShownYear(today.getFullYear())}" style="width: 45px;"></label>
        </div>
        <div>
          <strong>เดือนสิ้นสุด:</strong>
          <label>เดือน:
            <select id="endMonthQuery">
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
          <label>ปี: <input type="number" id="endYearQuery" min="${adToShownYear(2000)}" max="${adToShownYear(2100)}" value="${adToShownYear(today.getFullYear())}" style="width: 45px;"></label>
        </div>
      </div>
    `;
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