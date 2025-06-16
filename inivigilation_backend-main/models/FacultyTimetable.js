const mongoose = require('mongoose');

const FacultyTimetableSchema = new mongoose.Schema({
    faculty_name: String,
    department: String,
    subject: String,
    exam_date: String,
    exam_time: String,
    hall_no: String,
});

module.exports = mongoose.model('FacultyTimetable', FacultyTimetableSchema);
