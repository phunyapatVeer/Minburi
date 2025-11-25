-- สคริปต์สำหรับเพิ่มคอลัมน์ role และตั้งค่า Admin
-- รันใน SQL Server Management Studio หรือ Azure Data Studio

USE Minburi_Chlorine;
GO

-- 1. เช็คว่ามีคอลัมน์ role หรือยัง ถ้ายังไม่มีให้เพิ่ม
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Login]') AND name = 'role')
BEGIN
    ALTER TABLE [dbo].[Login] ADD [role] NVARCHAR(50) NULL;
    PRINT 'เพิ่มคอลัมน์ role สำเร็จ';
END
ELSE
BEGIN
    PRINT 'คอลัมน์ role มีอยู่แล้ว';
END
GO

-- 2. อัพเดทค่า role สำหรับ Administrator และ QUALITY ให้เป็น Admin
UPDATE [dbo].[Login] 
SET [role] = 'Admin' 
WHERE username IN ('Administrator', 'QUALITY');
GO

-- 3. อัพเดทผู้ใช้ที่เหลือให้เป็น Normal User (ถ้า role เป็น NULL)
UPDATE [dbo].[Login] 
SET [role] = 'Normal User' 
WHERE [role] IS NULL OR [role] = '';
GO

-- 4. ดูผลลัพธ์
SELECT username, password, role FROM [dbo].[Login] ORDER BY username;
GO

PRINT 'ตั้งค่า role เรียบร้อยแล้ว!';
