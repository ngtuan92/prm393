const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '123',
    database: process.env.DB_DATABASE || 'fpt_university_db',
  });

  try {
    await client.connect();
    console.log('Connected to database successfully!');

    // Clean tables before seeding
    console.log('Cleaning existing tables...');
    await client.query('DROP TABLE IF EXISTS grades CASCADE;');
    await client.query('DROP TABLE IF EXISTS discipline_logs CASCADE;');
    await client.query('CREATE TABLE grades (id SERIAL PRIMARY KEY, student_id VARCHAR(50), subject VARCHAR(100), semester VARCHAR(100), score DECIMAL, oral DECIMAL, fifteen_min DECIMAL, midterm DECIMAL, final_exam DECIMAL);');
    await client.query('CREATE TABLE IF NOT EXISTS schedules (id SERIAL PRIMARY KEY, student_id VARCHAR(50), subject_name VARCHAR(100), room VARCHAR(100), day_of_week VARCHAR(50), start_time TIME, semester VARCHAR(100));');
    await client.query('CREATE TABLE IF NOT EXISTS student_attendances (attendance_id SERIAL PRIMARY KEY, student_id VARCHAR(50) NOT NULL, subject_name VARCHAR(100) NOT NULL, class_name VARCHAR(100), room VARCHAR(100), study_date DATE NOT NULL, day_of_week VARCHAR(50), slot_name VARCHAR(50), start_time TIME, end_time TIME, status VARCHAR(50) NOT NULL, note TEXT);');
    await client.query('CREATE TABLE IF NOT EXISTS tuition_payments (tuition_id SERIAL PRIMARY KEY, student_id VARCHAR(50) NOT NULL, semester VARCHAR(100) NOT NULL, amount DECIMAL NOT NULL, status VARCHAR(50) NOT NULL, due_date DATE, paid_at TIMESTAMP);');
    await client.query('CREATE TABLE IF NOT EXISTS teacher_classes (teacher_class_id SERIAL PRIMARY KEY, teacher_id INTEGER NOT NULL, class_name VARCHAR(100) NOT NULL, subject_name VARCHAR(100) NOT NULL, semester VARCHAR(100) NOT NULL, student_count INTEGER);');
    await client.query('CREATE TABLE IF NOT EXISTS teacher_schedules (schedule_id SERIAL PRIMARY KEY, teacher_id INTEGER NOT NULL, class_name VARCHAR(100) NOT NULL, subject_name VARCHAR(100) NOT NULL, semester VARCHAR(100) NOT NULL, day_of_week VARCHAR(50) NOT NULL, slot_name VARCHAR(50), start_time TIME NOT NULL, end_time TIME NOT NULL, room VARCHAR(100));');
    await client.query('CREATE TABLE IF NOT EXISTS discipline_logs (id SERIAL PRIMARY KEY, student_id VARCHAR(50) NOT NULL, class_name VARCHAR(50) NOT NULL, violation_type VARCHAR(100) NOT NULL, description TEXT, image_url TEXT, created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP, logged_by VARCHAR(100));');
    await client.query('CREATE INDEX IF NOT EXISTS idx_student_attendances_class_student ON student_attendances (class_name, student_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_student_attendances_student_class_date ON student_attendances (student_id, class_name, study_date);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_grades_student_subject_semester ON grades (student_id, subject, semester);');
    await client.query('ALTER TABLE teachers ADD COLUMN IF NOT EXISTS homeroom_class VARCHAR(100) NULL;');

    // Create teacher_grade_imports table if it does not exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS teacher_grade_imports (
        grade_import_id SERIAL PRIMARY KEY,
        teacher_id INTEGER NOT NULL,
        class_name VARCHAR(100) NOT NULL,
        subject_name VARCHAR(100) NOT NULL,
        component_name VARCHAR(100) NOT NULL,
        semester VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL,
        imported_at TIMESTAMP NULL,
        source_file VARCHAR(255) NULL
      );
    `);

    await client.query('truncate table schedules restart identity cascade;');
    await client.query('truncate table student_attendances restart identity cascade;');
    await client.query('truncate table tuition_payments restart identity cascade;');
    await client.query('truncate table teacher_classes restart identity cascade;');
    await client.query('truncate table teacher_schedules restart identity cascade;');
    await client.query('truncate table discipline_logs restart identity cascade;');

    // 1. Seed grades
    console.log('Seeding grades...');
    await client.query(`
      insert into grades (student_id, subject, semester, score, oral, fifteen_min, midterm, final_exam)
      values
        ('HS100001', 'Toán học', 'Học kỳ I 2025-2026', 8.5, 8.0, 9.0, 8.5, 8.5),
        ('HS100001', 'Ngữ văn', 'Học kỳ I 2025-2026', 7.8, 7.0, 8.0, 7.5, 8.0),
        ('HS100001', 'Tiếng Anh', 'Học kỳ I 2025-2026', 9.0, 9.0, 9.5, 9.0, 8.8),
        ('HS100001', 'Vật lý', 'Học kỳ I 2025-2026', 6.5, 6.0, 7.0, 6.0, 7.0),
        ('HS100001', 'Hóa học', 'Học kỳ I 2025-2026', 8.0, 8.0, 8.0, 8.0, 8.0),
        ('HS100001', 'Sinh học', 'Học kỳ I 2025-2026', 7.2, 7.0, 7.0, 7.5, 7.0),
        ('HS100001', 'Tin học', 'Học kỳ I 2025-2026', 9.5, 9.0, 10.0, 9.5, 9.5),
        ('HS100001', 'Toán học', 'Học kỳ II 2025-2026', 9.0, 9.0, 9.0, 9.0, 9.0),
        ('HS100001', 'Tiếng Anh', 'Học kỳ II 2025-2026', 9.2, 9.0, 9.5, 9.0, 9.4),
        ('HS100002', 'Toán học', 'Học kỳ I 2025-2026', 7.7, 8.0, 7.0, 7.5, 8.0),
        ('HS100003', 'Tin học', 'Học kỳ I 2025-2026', 8.1, 7.0, 8.0, 8.5, 8.0)
    `);

    // 2. Seed student_attendances (runs Monday to Friday, no classes on Saturday/Sunday)
    console.log('Seeding student_attendances...');
    await client.query(`
      insert into student_attendances (student_id, subject_name, class_name, room, study_date, day_of_week, slot_name, start_time, end_time, status, note)
      values
        -- T2 (Monday)
        ('HS100001', 'Toán học', '10A1', 'Phòng 101', '2026-06-22', 'Monday', 'Tiết 1', '07:30:00', '08:15:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'Toán học', '10A1', 'Phòng 101', '2026-06-22', 'Monday', 'Tiết 2', '08:20:00', '09:05:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'Ngữ văn', '10A1', 'Phòng 101', '2026-06-22', 'Monday', 'Tiết 3', '09:20:00', '10:05:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'Ngữ văn', '10A1', 'Phòng 101', '2026-06-22', 'Monday', 'Tiết 4', '10:10:00', '10:55:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'Chào cờ & Sinh hoạt', '10A1', 'Phòng 101', '2026-06-22', 'Monday', 'Tiết 5', '11:00:00', '11:45:00', 'Present', 'Chào cờ'),
        ('HS100001', 'Phát triển cá nhân (PDP)', '10A1', 'Phòng 101', '2026-06-22', 'Monday', 'Tiết 6', '13:30:00', '14:15:00', 'Present', 'Kỹ năng giao tiếp'),
        ('HS100001', 'Phát triển cá nhân (PDP)', '10A1', 'Phòng 101', '2026-06-22', 'Monday', 'Tiết 7', '14:20:00', '15:05:00', 'Present', 'Kỹ năng giao tiếp'),
        ('HS100001', 'Võ Vovinam', '10A1', 'Sân Vovinam', '2026-06-22', 'Monday', 'Tiết 8', '15:20:00', '16:05:00', 'Present', 'Võ nhạc'),
        
        -- T3 (Tuesday)
        ('HS100001', 'Tiếng Anh (MOET)', '10A1', 'Phòng 102', '2026-06-23', 'Tuesday', 'Tiết 1', '07:30:00', '08:15:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'Tiếng Anh (MOET)', '10A1', 'Phòng 102', '2026-06-23', 'Tuesday', 'Tiết 2', '08:20:00', '09:05:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'Vật lý', '10A1', 'Phòng 101', '2026-06-23', 'Tuesday', 'Tiết 3', '09:20:00', '10:05:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'Hóa học', '10A1', 'Phòng 101', '2026-06-23', 'Tuesday', 'Tiết 4', '10:10:00', '10:55:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'Sinh học', '10A1', 'Phòng 101', '2026-06-23', 'Tuesday', 'Tiết 5', '11:00:00', '11:45:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'Tiếng Anh bản ngữ', '10A1', 'Phòng 102', '2026-06-23', 'Tuesday', 'Tiết 6', '13:30:00', '14:15:00', 'Present', 'Học với GV nước ngoài'),
        ('HS100001', 'Tiếng Anh bản ngữ', '10A1', 'Phòng 102', '2026-06-23', 'Tuesday', 'Tiết 7', '14:20:00', '15:05:00', 'Present', 'Học với GV nước ngoài'),
        ('HS100001', 'Tự học hướng dẫn Toán', '10A1', 'Phòng 101', '2026-06-23', 'Tuesday', 'Tiết 8', '15:20:00', '16:05:00', 'Present', 'Luyện đề thi'),
        
        -- T4 (Wednesday)
        ('HS100001', 'Toán học', '10A1', 'Phòng 101', '2026-06-24', 'Wednesday', 'Tiết 1', '07:30:00', '08:15:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'Toán học', '10A1', 'Phòng 101', '2026-06-24', 'Wednesday', 'Tiết 2', '08:20:00', '09:05:00', 'Absent', 'Nghỉ học'),
        ('HS100001', 'Tin học', '10A1', 'Phòng Lab 1', '2026-06-24', 'Wednesday', 'Tiết 3', '09:20:00', '10:05:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'Lịch sử', '10A1', 'Phòng 101', '2026-06-24', 'Wednesday', 'Tiết 4', '10:10:00', '10:55:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'Địa lý', '10A1', 'Phòng 101', '2026-06-24', 'Wednesday', 'Tiết 5', '11:00:00', '11:45:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'Robotics & STEM', '10A1', 'Phòng Lab 1', '2026-06-24', 'Wednesday', 'Tiết 6', '13:30:00', '14:15:00', 'Present', 'Lắp ráp Robot'),
        ('HS100001', 'Robotics & STEM', '10A1', 'Phòng Lab 1', '2026-06-24', 'Wednesday', 'Tiết 7', '14:20:00', '15:05:00', 'Present', 'Lắp ráp Robot'),
        ('HS100001', 'Câu lạc bộ Nghệ thuật', '10A1', 'Phòng Đa năng', '2026-06-24', 'Wednesday', 'Tiết 8', '15:20:00', '16:05:00', 'Present', 'Sinh hoạt CLB'),
        
        -- T5 (Thursday)
        ('HS100001', 'Ngữ văn', '10A1', 'Phòng 101', '2026-06-25', 'Thursday', 'Tiết 1', '07:30:00', '08:15:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'Ngữ văn', '10A1', 'Phòng 101', '2026-06-25', 'Thursday', 'Tiết 2', '08:20:00', '09:05:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'Vật lý', '10A1', 'Phòng 101', '2026-06-25', 'Thursday', 'Tiết 3', '09:20:00', '10:05:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'Hóa học', '10A1', 'Phòng 101', '2026-06-25', 'Thursday', 'Tiết 4', '10:10:00', '10:55:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'GDCD', '10A1', 'Phòng 101', '2026-06-25', 'Thursday', 'Tiết 5', '11:00:00', '11:45:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'Võ Vovinam', '10A1', 'Sân Vovinam', '2026-06-25', 'Thursday', 'Tiết 6', '13:30:00', '14:15:00', 'Present', 'Đối kháng cơ bản'),
        ('HS100001', 'Võ Vovinam', '10A1', 'Sân Vovinam', '2026-06-25', 'Thursday', 'Tiết 7', '14:20:00', '15:05:00', 'Present', 'Đối kháng cơ bản'),
        ('HS100001', 'Tự học hướng dẫn Ngữ văn', '10A1', 'Phòng 101', '2026-06-25', 'Thursday', 'Tiết 8', '15:20:00', '16:05:00', 'Present', 'Tập làm văn'),
        
        -- T6 (Friday - Afternoon off, students go home)
        ('HS100001', 'Toán học', '10A1', 'Phòng 101', '2026-06-26', 'Friday', 'Tiết 1', '07:30:00', '08:15:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'Toán học', '10A1', 'Phòng 101', '2026-06-26', 'Friday', 'Tiết 2', '08:20:00', '09:05:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'Tiếng Anh (MOET)', '10A1', 'Phòng 102', '2026-06-26', 'Friday', 'Tiết 3', '09:20:00', '10:05:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'Tiếng Anh (MOET)', '10A1', 'Phòng 102', '2026-06-26', 'Friday', 'Tiết 4', '10:10:00', '10:55:00', 'Present', 'Đi học đầy đủ'),
        ('HS100001', 'Thu dọn phòng nội trú', '10A1', 'Khu nội trú', '2026-06-26', 'Friday', 'Tiết 5', '11:00:00', '11:45:00', 'Present', 'Check-out nội trú'),

        -- Add HS100002 to 10A1
        ('HS100002', 'Toán học', '10A1', 'Phòng 101', '2026-06-22', 'Monday', 'Tiết 1', '07:30:00', '08:15:00', 'Present', 'Đi học đầy đủ'),
        -- Add HS100002 to 11A2
        ('HS100002', 'Toán học', '11A2', 'Phòng 202', '2026-06-22', 'Monday', 'Tiết 8', '15:20:00', '16:05:00', 'Present', 'Đi học đầy đủ'),
        -- Add HS100003 to 11A2
        ('HS100003', 'Toán học', '11A2', 'Phòng 202', '2026-06-22', 'Monday', 'Tiết 8', '15:20:00', '16:05:00', 'Present', 'Đi học đầy đủ'),
        -- Add HS100003 to 12A1
        ('HS100003', 'Tin học', '12A1', 'Phòng Lab 1', '2026-06-24', 'Wednesday', 'Tiết 3', '09:20:00', '10:05:00', 'Present', 'Đi học đầy đủ')
    `);

    // 3. Seed tuition_payments
    console.log('Seeding tuition_payments...');
    await client.query(`
      insert into tuition_payments (student_id, semester, amount, status, due_date, paid_at)
      values
        ('HS100001', 'Học kỳ I 2025-2026', '15000000', 'Đã đóng', '2025-09-05', '2025-09-02 09:30:00'),
        ('HS100001', 'Học kỳ II 2025-2026', '15000000', 'Chờ thanh toán', '2026-02-05', null)
    `);

    // 4. Seed teacher_classes
    console.log('Seeding teacher_classes...');
    await client.query(`
      insert into teacher_classes (teacher_id, class_name, subject_name, semester, student_count)
      values
        (1, '10A1', 'Toán học', 'Học kỳ I 2025-2026', 32),
        (1, '11A2', 'Toán học', 'Học kỳ I 2025-2026', 34),
        (1, '12A1', 'Tin học', 'Học kỳ I 2025-2026', 30)
    `);

    // 5. Seed teacher_schedules (teacher GV001 - Monday to Friday only)
    console.log('Seeding teacher_schedules...');
    await client.query(`
      insert into teacher_schedules (teacher_id, class_name, subject_name, semester, day_of_week, slot_name, start_time, end_time, room)
      values
        -- T2 (Monday)
        (1, '10A1', 'Toán học', 'Học kỳ I 2025-2026', 'T2', 'Tiết 1', '07:30:00', '08:15:00', 'Phòng 101'),
        (1, '10A1', 'Toán học', 'Học kỳ I 2025-2026', 'T2', 'Tiết 2', '08:20:00', '09:05:00', 'Phòng 101'),
        (1, '11A2', 'Toán học (Tự học có HD)', 'Học kỳ I 2025-2026', 'T2', 'Tiết 8', '15:20:00', '16:05:00', 'Phòng 202'),
        
        -- T3 (Tuesday)
        (1, '10A1', 'Toán học (Tự học có HD)', 'Học kỳ I 2025-2026', 'T3', 'Tiết 8', '15:20:00', '16:05:00', 'Phòng 101'),
        
        -- T4 (Wednesday)
        (1, '10A1', 'Toán học', 'Học kỳ I 2025-2026', 'T4', 'Tiết 1', '07:30:00', '08:15:00', 'Phòng 101'),
        (1, '10A1', 'Toán học', 'Học kỳ I 2025-2026', 'T4', 'Tiết 2', '08:20:00', '09:05:00', 'Phòng 101'),
        (1, '10A1', 'Tin học', 'Học kỳ I 2025-2026', 'T4', 'Tiết 3', '09:20:00', '10:05:00', 'Phòng Lab 1'),
        (1, '12A1', 'Robotics & STEM', 'Học kỳ I 2025-2026', 'T4', 'Tiết 6', '13:30:00', '14:15:00', 'Phòng Lab 1'),
        (1, '12A1', 'Robotics & STEM', 'Học kỳ I 2025-2026', 'T4', 'Tiết 7', '14:20:00', '15:05:00', 'Phòng Lab 1'),
        
        -- T5 (Thursday)
        (1, '11A2', 'Toán học', 'Học kỳ I 2025-2026', 'T5', 'Tiết 1', '07:30:00', '08:15:00', 'Phòng 202'),
        (1, '11A2', 'Toán học', 'Học kỳ I 2025-2026', 'T5', 'Tiết 2', '08:20:00', '09:05:00', 'Phòng 202'),
        (1, '11A2', 'Toán học (Tự học có HD)', 'Học kỳ I 2025-2026', 'T5', 'Tiết 8', '15:20:00', '16:05:00', 'Phòng 202'),
        
        -- T6 (Friday)
        (1, '10A1', 'Toán học', 'Học kỳ I 2025-2026', 'T6', 'Tiết 1', '07:30:00', '08:15:00', 'Phòng 101'),
        (1, '10A1', 'Toán học', 'Học kỳ I 2025-2026', 'T6', 'Tiết 2', '08:20:00', '09:05:00', 'Phòng 101')
    `);

    // 6. Seed discipline_logs
    console.log('Seeding discipline_logs...');
    await client.query(`
      insert into discipline_logs (student_id, class_name, violation_type, description, image_url, logged_by, created_at)
      values
        ('HS100001', '10A1', 'Đồng phục', 'Không thắt cà vạt và không đi giày thể thao theo nội quy trường.', 'assets/violations/uniform.jpg', 'Giám thị Nguyễn Văn A', '2026-06-22 07:45:00'),
        ('HS100001', '10A1', 'Đi muộn', 'Vào lớp muộn 15 phút tiết Chào cờ.', null, 'Giám thị Nguyễn Văn A', '2026-06-22 11:15:00'),
        ('HS100001', '10A1', 'Dùng điện thoại', 'Sử dụng điện thoại chơi game trong tiết Sử.', 'assets/violations/phone.jpg', 'Giám thị Nguyễn Văn A', '2026-06-24 10:20:00')
    `);

    // Set homeroom class for teacher with ID = 1
    await client.query("UPDATE teachers SET homeroom_class = '10A1' WHERE teacher_id = 1;");
    await client.query("UPDATE student_attendances SET class_name = '10A1' WHERE class_name = 'SE1915';");

    console.log('Seeding completed successfully!');
  } catch (err) {
    console.error('Error seeding database:', err);
  } finally {
    await client.end();
  }
}

main();
