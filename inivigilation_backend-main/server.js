require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MongoDB Connection
mongoose
  .connect(
    process.env.MONGODB_URI || "mongodb://localhost:27017/invigilationDB",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  .then(() => console.log("✅ Connected to MongoDB: invigilationDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Schemas
const FacultySchema = new mongoose.Schema({
  name: String,
  username: { type: String, unique: true, required: true },
  email: String,
  department: String,
  password: String,
  role: { type: String, default: "faculty" },
});

const Faculty = mongoose.model("Faculty", FacultySchema);

const FacultyScheduleSchema = new mongoose.Schema({
  username: { type: String, required: true },
  schedule: { type: Map, of: mongoose.Schema.Types.Mixed },
});

const FacultySchedule = mongoose.model("FacultySchedule", FacultyScheduleSchema);

const ExamSchema = new mongoose.Schema({
  examName: String,
  examType: {
    type: String,
    enum: ["T1-Exam", "T4-Exam", "External", "Semester"],
    required: true,
  },
  year: {
    type: String,
    enum: ["1", "2", "3", "4", "All"],
    required: function () {
      return ["T1-Exam", "T4-Exam"].includes(this.examType);
    },
  },
  date: Date,
  slots: [
    {
      slotNumber: Number,
      subject: String,
      date: Date,
      startTime: String,
      endTime: String,
      sections: [
        {
          sectionNumber: Number,
          faculty: [
            {
              username: String,
              name: String,
              status: {
                type: String,
                enum: ["Assigned", "Confirmed", "Swapped"],
                default: "Assigned",
              },
            },
          ],
        },
      ],
    },
  ],
  status: { type: String, enum: ["Scheduled", "Completed"], default: "Scheduled" },
});

const Exam = mongoose.model("Exam", ExamSchema);

const InvigilationSchema = new mongoose.Schema(
  {
    username: String,
    examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam" },
    examName: String,
    examType: String,
    date: { type: Date, required: true },
    startTime: String,
    endTime: String,
    venue: String,
    status: {
      type: String,
      enum: ["Assigned", "Confirmed", "Swapped", "Completed"],
      default: "Assigned",
    },
  },
  { timestamps: true }
);

const Invigilation = mongoose.model("Invigilation", InvigilationSchema);

const SwapRequestSchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam" },
  invigilationId: { type: mongoose.Schema.Types.ObjectId, ref: "Invigilation" },
  requestingUsername: String,
  requestingFaculty: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Faculty",
  },
  requestedUsername: String,
  requestedFaculty: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Faculty",
  },
  reason: String,
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  createdAt: { type: Date, default: Date.now },
});

const SwapRequest = mongoose.model("SwapRequest", SwapRequestSchema);

const NotificationSchema = new mongoose.Schema({
  username: String,
  message: String,
  status: { type: String, enum: ["Unread", "Read"], default: "Unread" },
  createdAt: { type: Date, default: Date.now },
  relatedExam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam" },
});

const Notification = mongoose.model("Notification", NotificationSchema);

const ADMIN_CREDENTIALS = {
  username: process.env.ADMIN_USERNAME || "admin",
  password: process.env.ADMIN_PASSWORD || "admin123",
};

// Helper Functions
const timeToMinutes = (time) => {
  if (!time) return 0;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
};

const validateTimeConflict = (existingStart, existingEnd, newStart, newEnd) => {
  return (
    (newStart >= existingStart && newStart < existingEnd) ||
    (newEnd > existingStart && newEnd <= existingEnd) ||
    (newStart <= existingStart && newEnd >= existingEnd)
  );
};

// Routes

// Login API
app.post("/login", async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (role === "admin") {
      if (
        username === ADMIN_CREDENTIALS.username &&
        password === ADMIN_CREDENTIALS.password
      ) {
        return res.status(200).json({
          message: "Admin login successful",
          role,
          redirect: "/AdminPage",
        });
      }
      return res.status(400).json({ message: "Invalid admin credentials" });
    } else if (role === "faculty") {
      const faculty = await Faculty.findOne({ username });
      if (!faculty)
        return res.status(400).json({ message: "Faculty not found" });
      if (faculty.password !== password)
        return res.status(400).json({ message: "Invalid credentials" });

      res.status(200).json({
        message: "Faculty login successful",
        role,
        facultyUsername: faculty.username,
        redirect: "/FacultyDashboard",
      });
    } else {
      return res.status(400).json({ message: "Invalid role" });
    }
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Login error", error: err.message });
  }
});

// Faculty Registration
app.post("/api/faculty/register", async (req, res)  => {
  try {
    const { name, username, email, department, password } = req.body;

    const existingFaculty = await Faculty.findOne({ username });
    if (existingFaculty) {
      return res.status(400).json({ message: "Username already exists" });
    }

    const newFaculty = new Faculty({
      name,
      username,
      email,
      department,
      password,
    });
    await newFaculty.save();
    res.status(201).json({ message: "Faculty registered successfully" });
  } catch (error) {
    console.error("Faculty registration error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get all faculty
app.get("/api/faculty", async (req, res) => {
  try {
    const facultyList = await Faculty.find();
    res.status(200).json(facultyList);
  } catch (error) {
    console.error("Get faculty error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get faculty schedules
app.get("/api/facultyschedules", async (req, res) => {
  try {
    const schedules = await FacultySchedule.find();
    res.status(200).json(schedules);
  } catch (error) {
    console.error("Get schedules error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Generate faculty assignment schedule
app.post("/api/exams/generate-schedule", async (req, res) => {
    try {
      const { slotDetails, facultyPerSection, examType, year } = req.body;
  
      // Validate input
      if (!slotDetails || !slotDetails.length || !facultyPerSection || !examType) {
        return res.status(400).json({
          message: "Slot details, faculty per section, and exam type are required",
        });
      }
  
      if (["T1-Exam", "T4-Exam"].includes(examType) && !year) {
        return res.status(400).json({
          message: "Year is required for this exam type",
        });
      }
  
      // Get all faculty with their schedules
      const facultySchedules = await FacultySchedule.find().lean();
      const facultyList = await Faculty.find().lean();
      const totalFaculty = facultyList.length;
  
      if (totalFaculty === 0) {
        return res.status(400).json({
          message: "No faculty available for assignment",
          requiresManualAssignment: true,
        });
      }
  
      let assignedFaculty = [];
      let facultyAssignmentCount = {};
      let facultyAssignedDates = {};
  
      // Initialize assignment counts and dates
      facultyList.forEach((faculty) => {
        facultyAssignmentCount[faculty.username] = 0;
        facultyAssignedDates[faculty.username] = new Set();
      });
  
      // Get all existing invigilations to check for date conflicts
      const existingInvigilations = await Invigilation.find().lean();
  
      // Process each slot
      for (const slot of slotDetails) {
        const slotDate = new Date(slot.date).toISOString().split("T")[0];
        const slotDay = new Date(slot.date).toLocaleDateString("en-US", {
          weekday: "long",
        });
        const slotStart = timeToMinutes(slot.startTime);
        let slotEnd = timeToMinutes(slot.endTime);
  
        // For T1 and T4 exams, enforce 1-hour duration
        if (["T1-Exam", "T4-Exam"].includes(examType)) {
          slotEnd = slotStart + 60; // Ensure end time is start time + 1 hour
        }
  
        const sectionsPerSlot = parseInt(slot.sectionsPerSlot, 10);
        const facultyNeeded = sectionsPerSlot * parseInt(facultyPerSection, 10);
  
        // Create a list of all faculty in random order
        let shuffledFaculty = [...facultyList];
        for (let i = shuffledFaculty.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledFaculty[i], shuffledFaculty[j]] = [shuffledFaculty[j], shuffledFaculty[i]];
        }
  
        let availableFaculty = [];
  
        for (const faculty of shuffledFaculty) {
          // Check if faculty is already assigned to this date
          if (facultyAssignedDates[faculty.username].has(slotDate)) {
            continue;
          }
  
          // Check for existing invigilations on this date
          const hasExistingInvigilation = existingInvigilations.some(
            (inv) =>
              inv.username === faculty.username &&
              new Date(inv.date).toISOString().split("T")[0] === slotDate &&
              validateTimeConflict(
                timeToMinutes(inv.startTime),
                timeToMinutes(inv.endTime),
                slotStart,
                slotEnd
              )
          );
  
          if (hasExistingInvigilation) continue;
  
          // For External/Semester exams, no schedule check needed
          if (examType === "External" || examType === "Semester") {
            availableFaculty.push({
              username: faculty.username,
              name: faculty.name,
              department: faculty.department,
              assignmentCount: facultyAssignmentCount[faculty.username] || 0,
            });
            continue;
          }
  
          // For T1/T4 exams, check schedules for conflicts
          const facultySchedule = facultySchedules.find(
            (fs) => fs.username === faculty.username
          );
  
          if (!facultySchedule || !facultySchedule.schedule) {
            availableFaculty.push({
              username: faculty.username,
              name: faculty.name,
              department: faculty.department,
              assignmentCount: facultyAssignmentCount[faculty.username] || 0,
            });
            continue;
          }
  
          const daySchedule = facultySchedule.schedule.get(slotDay) || {};
          let hasConflict = false;
  
          for (const [timeSlot, teachingYear] of Object.entries(daySchedule)) {
            try {
              const [startStr, endStr] = timeSlot.split(" - ");
              const start = timeToMinutes(startStr);
              const end = timeToMinutes(endStr);
  
              // Check for any overlap with the exam time
              if (validateTimeConflict(start, end, slotStart, slotStart + 60)) {
                // For T1/T4 exams, check if the faculty is teaching the same year
                if (["T1-Exam", "T4-Exam"].includes(examType)) {
                  if (teachingYear === year || teachingYear === "All") {
                    hasConflict = true;
                    break;
                  }
                } else {
                  hasConflict = true;
                  break;
                }
              }
            } catch (err) {
              console.error(`Error parsing time slot ${timeSlot} for ${faculty.username}:`, err);
              continue;
            }
          }
  
          if (!hasConflict) {
            availableFaculty.push({
              username: faculty.username,
              name: faculty.name,
              department: faculty.department,
              assignmentCount: facultyAssignmentCount[faculty.username] || 0,
            });
          }
        }
  
        // If not enough faculty, trigger manual assignment
        if (availableFaculty.length < facultyNeeded) {
          return res.status(400).json({
            message: "Not enough faculty available",
            requiresManualAssignment: true,
            examDetails: {
              examName: slot.subject,
              slotNumber: slot.slotNumber,
              sectionNumber: Math.ceil(facultyNeeded / facultyPerSection),
              date: slot.date,
              startTime: slot.startTime,
              endTime: slot.endTime,
            },
          });
        }
  
        // Sort by assignment count to distribute load evenly
        availableFaculty.sort((a, b) => a.assignmentCount - b.assignmentCount);
  
        // Assign faculty to sections
        for (let section = 1; section <= sectionsPerSlot; section++) {
          const facultyForSection = availableFaculty.splice(0, facultyPerSection);
  
          assignedFaculty.push({
            date: slotDate,
            day: slotDay,
            slot: slot.slotNumber || 1,
            section,
            faculty: facultyForSection,
            subject: slot.subject,
            startTime: slot.startTime,
            endTime: ["T1-Exam", "T4-Exam"].includes(examType)
              ? minutesToTime(slotStart + 60)
              : slot.endTime,
          });
  
          // Update assignment counts and dates
          facultyForSection.forEach((faculty) => {
            if (faculty.username !== "no-faculty") {
              facultyAssignmentCount[faculty.username] =
                (facultyAssignmentCount[faculty.username] || 0) + 1;
              facultyAssignedDates[faculty.username].add(slotDate);
            }
          });
        }
      }
  
      res.status(200).json(assignedFaculty);
    } catch (error) {
      console.error("Schedule generation error:", error);
      res.status(500).json({
        error: error.message,
        message: "Failed to generate schedule. Please try again.",
      });
    }
  });
// Create Exam with automatic faculty assignment
app.post("/api/exams", async (req, res) => {
  try {
    const { examName, examType, year, slots } = req.body;
    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));

    // Validate exam data
    if (!examName || !examType || !slots || slots.length === 0) {
      return res
        .status(400)
        .json({ message: "Exam name, type, and slots are required" });
    }

    if (["T1-Exam", "T4-Exam"].includes(examType) && !year) {
      return res
        .status(400)
        .json({ message: "Year is required for this exam type" });
    }

    // Validate each slot
    for (const slot of slots) {
      if (!slot.date || !slot.startTime || !slot.endTime) {
        return res.status(400).json({
          message: "All slots must have date, start time, and end time",
          slotNumber: slot.slotNumber,
        });
      }

      const slotDate = new Date(slot.date);

      if (isNaN(slotDate.getTime())) {
        return res.status(400).json({
          message: "Invalid date format",
          slotNumber: slot.slotNumber,
        });
      }

      if (slotDate < today) {
        return res.status(400).json({
          message: "Cannot schedule exam in the past",
          slotNumber: slot.slotNumber,
        });
      }

      // Check if the slot date is today
      if (slotDate.toDateString() === today.toDateString()) {
        const [startH, startM] = slot.startTime.split(":").map(Number);
        const currentH = now.getHours();
        const currentM = now.getMinutes();

        if (startH < currentH || (startH === currentH && startM <= currentM)) {
          return res.status(400).json({
            message: `Start time must be after ${currentH}:${currentM
              .toString()
              .padStart(2, "0")}`,
            slotNumber: slot.slotNumber,
          });
        }
      }

      // Validate 1-hour duration for T1 and T4 exams
      if (["T1-Exam", "T4-Exam"].includes(examType)) {
        const startMinutes = timeToMinutes(slot.startTime);
        const endMinutes = timeToMinutes(slot.endTime);
        const duration = endMinutes - startMinutes;

        if (duration !== 60) {
          return res.status(400).json({
            message: "T1 and T4 exams must be exactly 1 hour long",
            slotNumber: slot.slotNumber,
          });
        }
      }

      if (slot.startTime >= slot.endTime) {
        return res.status(400).json({
          message: "End time must be after start time",
          slotNumber: slot.slotNumber,
        });
      }

      // Validate faculty assignments
      for (const section of slot.sections || []) {
        for (const faculty of section.faculty || []) {
          if (faculty.username && faculty.username !== "no-faculty") {
            const facultyExists = await Faculty.findOne({
              username: faculty.username,
            });
            if (!facultyExists) {
              return res.status(400).json({
                message: `Faculty ${faculty.username} not found`,
                slotNumber: slot.slotNumber,
                sectionNumber: section.sectionNumber,
              });
            }
          }
        }
      }
    }

    // Create exam document
    const exam = new Exam({
      examName,
      examType,
      year: ["T1-Exam", "T4-Exam"].includes(examType) ? year : undefined,
      date: new Date(slots[0].date),
      slots: slots.map((slot) => ({
        slotNumber: slot.slotNumber,
        subject: slot.subject,
        date: new Date(slot.date),
        startTime: slot.startTime,
        endTime: slot.endTime,
        sections: slot.sections.map((section) => ({
          sectionNumber: section.sectionNumber,
          faculty: section.faculty.map((f) => ({
            username: f.username,
            name: f.name,
            status: f.status || "Assigned",
          })),
        })),
      })),
      status: "Scheduled",
    });

    const savedExam = await exam.save();

    // Create invigilations and notifications
    const invigilationPromises = [];
    const notificationPromises = [];

    for (const slot of savedExam.slots) {
      for (const section of slot.sections) {
        for (const faculty of section.faculty) {
          if (faculty.username && faculty.username !== "no-faculty") {
            const invigilation = new Invigilation({
              username: faculty.username,
              examId: savedExam._id,
              examName: savedExam.examName,
              examType: savedExam.examType,
              date: new Date(slot.date),
              startTime: slot.startTime,
              endTime: slot.endTime,
              venue: section.sectionNumber
                ? `Slot ${slot.slotNumber}, Section ${section.sectionNumber}`
                : `Slot ${slot.slotNumber}`,
              status: "Assigned",
            });
            invigilationPromises.push(
              invigilation.save().catch((err) => {
                console.error(
                  `Failed to save invigilation for ${faculty.username}:`,
                  err
                );
                return null;
              })
            );

            const notification = new Notification({
              username: faculty.username,
              message: `New invigilation assigned: ${savedExam.examName} on ${new Date(
                slot.date
              ).toLocaleDateString()} (${slot.startTime}-${slot.endTime})`,
              relatedExam: savedExam._id,
            });
            notificationPromises.push(
              notification.save().catch((err) => {
                console.error(
                  `Failed to save notification for ${faculty.username}:`,
                  err
                );
                return null;
              })
            );
          }
        }
      }
    }

    await Promise.all([...invigilationPromises, ...notificationPromises]);

    res.status(201).json(savedExam);
  } catch (error) {
    console.error("Create exam error:", error);
    res.status(500).json({
      error: error.message,
      message: "Failed to create exam. Please try again.",
    });
  }
});

// Get all exams
app.get("/api/exams", async (req, res) => {
  try {
    const exams = await Exam.find().sort({ date: -1 });
    res.status(200).json(exams);
  } catch (error) {
    console.error("Get exams error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get completed exams
app.get("/api/exams/completed", async (req, res) => {
  try {
    const now = new Date();
    const pastExams = await Exam.find({
      status: "Completed",
      date: { $lt: now },
    }).sort({ date: -1 });

    res.status(200).json(pastExams);
  } catch (error) {
    console.error("Get completed exams error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Faculty Dashboard
app.get("/api/faculty/dashboard/:username", async (req, res) => {
  try {
    const { username } = req.params;

    const faculty = await Faculty.findOne({ username });
    if (!faculty) {
      return res.status(404).json({ message: "Faculty not found" });
    }

    const invigilations = await Invigilation.find({ username })
      .populate("examId")
      .sort({ date: 1 })
      .lean();

    const notifications = await Notification.find({ username })
      .sort({ createdAt: -1 })
      .lean();

    let schedule = await FacultySchedule.findOne({ username }).lean();
    if (!schedule) {
      schedule = { schedule: {} };
    }

    res.status(200).json({
      faculty: {
        name: faculty.name,
        username: faculty.username,
        department: faculty.department,
        email: faculty.email,
      },
      invigilations,
      notifications,
      schedule,
    });
  } catch (error) {
    console.error("Faculty dashboard error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Confirm invigilation
app.put("/api/invigilations/:id/confirm", async (req, res) => {
  try {
    const invigilation = await Invigilation.findByIdAndUpdate(
      req.params.id,
      { status: "Confirmed" },
      { new: true }
    );

    if (!invigilation) {
      return res.status(404).json({ message: "Invigilation not found" });
    }

    await Exam.updateOne(
      {
        _id: invigilation.examId,
        "slots.sections.faculty.username": invigilation.username,
      },
      {
        $set: {
          "slots.$[].sections.$[].faculty.$[faculty].status": "Confirmed",
        },
      },
      { arrayFilters: [{ "faculty.username": invigilation.username }] }
    );

    res.status(200).json({ message: "Invigilation confirmed successfully" });
  } catch (error) {
    console.error("Confirm invigilation error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Swap Request Endpoints
app.post("/api/swap-requests", async (req, res) => {
  try {
    const { invigilationId, requestingUsername, requestedUsername, reason } =
      req.body;

    const existingRequest = await SwapRequest.findOne({
      invigilationId,
      requestingUsername,
      status: "pending",
    });

    if (existingRequest) {
      return res
        .status(400)
        .json({
          message: "You already have a pending swap request for this invigilation",
        });
    }

    const invigilation = await Invigilation.findById(invigilationId).populate(
      "examId"
    );
    if (!invigilation) {
      return res.status(404).json({ message: "Invigilation not found" });
    }

    const requestingFaculty = await Faculty.findOne({
      username: requestingUsername,
    });
    if (!requestingFaculty) {
      return res
        .status(404)
        .json({ message: "Requesting faculty not found" });
    }

    const requestedFaculty = await Faculty.findOne({
      username: requestedUsername,
    });
    if (!requestedFaculty) {
      return res.status(404).json({ message: "Requested faculty not found" });
    }

    const swapRequest = new SwapRequest({
      examId: invigilation.examId._id,
      invigilationId,
      requestingUsername,
      requestingFaculty: requestingFaculty._id,
      requestedUsername,
      requestedFaculty: requestedFaculty._id,
      reason,
    });

    await swapRequest.save();

    const adminNotification = new Notification({
      username: "admin",
      message: `${requestingFaculty.name} has requested to swap with ${requestedFaculty.name} for ${invigilation.examName} on ${new Date(
        invigilation.date
      ).toLocaleDateString()}. Reason: ${reason}`,
      relatedExam: invigilation.examId._id,
    });

    await adminNotification.save();

    res.status(201).json({ message: "Swap request submitted successfully" });
  } catch (error) {
    console.error("Swap request error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get all swap requests
app.get("/api/swap-requests", async (req, res) => {
  try {
    const requests = await SwapRequest.find({ status: "pending" })
      .populate("examId")
      .populate("invigilationId")
      .populate("requestingFaculty")
      .populate("requestedFaculty")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(requests);
  } catch (error) {
    console.error("Get swap requests error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Process swap request
app.put("/api/swap-requests/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ message: "Invalid action" });
    }

    const swapRequest = await SwapRequest.findById(id)
      .populate("examId")
      .populate("invigilationId")
      .populate("requestingFaculty")
      .populate("requestedFaculty");

    if (!swapRequest) {
      return res.status(404).json({ message: "Swap request not found" });
    }

    if (action === "approve") {
      const requestedFaculty = await Faculty.findOne({
        username: swapRequest.requestedUsername,
      });
      if (!requestedFaculty) {
        return res
          .status(404)
          .json({ message: "Requested faculty not found" });
      }

      const updatedInvigilation = await Invigilation.findByIdAndUpdate(
        swapRequest.invigilationId._id,
        {
          username: swapRequest.requestedUsername,
          status: "Swapped",
        },
        { new: true }
      );

      await Exam.updateOne(
        {
          _id: swapRequest.examId._id,
          "slots.sections.faculty.username": swapRequest.requestingUsername,
        },
        {
          $set: {
            "slots.$[].sections.$[].faculty.$[faculty].username":
              swapRequest.requestedUsername,
            "slots.$[].sections.$[].faculty.$[faculty].name":
              requestedFaculty.name,
            "slots.$[].sections.$[].faculty.$[faculty].status": "Swapped",
          },
        },
        { arrayFilters: [{ "faculty.username": swapRequest.requestingUsername }] }
      );

      await Promise.all([
        new Notification({
          username: swapRequest.requestingUsername,
          message: `Your swap request for ${swapRequest.examId.examName} has been approved. ${requestedFaculty.name} will take your slot.`,
          relatedExam: swapRequest.examId._id,
        }).save(),
        new Notification({
          username: swapRequest.requestedUsername,
          message: `You have been assigned to invigilate ${swapRequest.examId.examName} on ${new Date(
            swapRequest.invigilationId.date
          ).toDateString()} (${
            swapRequest.invigilationId.startTime
          }-${swapRequest.invigilationId.endTime}) due to a swap.`,
          relatedExam: swapRequest.examId._id,
        }).save(),
      ]);
    } else {
      await new Notification({
        username: swapRequest.requestingUsername,
        message: `Your swap request for ${swapRequest.examId.examName} has been rejected.`,
        relatedExam: swapRequest.examId._id,
      }).save();
    }

    await SwapRequest.findByIdAndUpdate(id, {
      status: action === "approve" ? "approved" : "rejected",
    });

    res.status(200).json({
      message: `Swap request ${action}d successfully`,
    });
  } catch (error) {
    console.error("Swap request error:", error);
    res.status(500).json({
      error: error.message,
      message: "Failed to process swap request",
    });
  }
});

// Manual faculty assignment
app.post("/api/exams/manual-assignment", async (req, res) => {
  try {
    const {
      examId,
      slotNumber,
      sectionNumber,
      requestingUsername,
      replacementUsername,
    } = req.body;

    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: "Exam not found" });
    }

    const slot = exam.slots.find((s) => s.slotNumber === parseInt(slotNumber));
    if (!slot) {
      return res.status(404).json({ message: "Slot not found in exam" });
    }

    const section = slot.sections.find(
      (s) => s.sectionNumber === parseInt(sectionNumber)
    );
    if (!section) {
      return res.status(404).json({ message: "Section not found in slot" });
    }

    const facultyIndex = section.faculty.findIndex(
      (f) => f.username === requestingUsername
    );
    if (facultyIndex === -1) {
      return res
        .status(404)
        .json({ message: "Faculty assignment not found in section" });
    }

    const replacementFaculty = await Faculty.findOne({
      username: replacementUsername,
    });
    if (!replacementFaculty) {
      return res.status(404).json({ message: "Replacement faculty not found" });
    }

    const isAlreadyAssigned = section.faculty.some(
      (f) => f.username === replacementUsername
    );
    if (isAlreadyAssigned) {
      return res.status(400).json({
        message: "Replacement faculty is already assigned to this section",
        replacementUsername,
      });
    }

    const originalFaculty = section.faculty[facultyIndex];
    section.faculty[facultyIndex] = {
      username: replacementFaculty.username,
      name: replacementFaculty.name,
      status: "Swapped",
    };

    await exam.save();

    await Invigilation.updateOne(
      {
        examId: exam._id,
        username: requestingUsername,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
      },
      {
        username: replacementFaculty.username,
        status: "Swapped",
      }
    );

    await Promise.all([
      new Notification({
        username: requestingUsername,
        message: `Your invigilation for ${exam.examName} has been manually reassigned to ${replacementFaculty.name}.`,
        relatedExam: exam._id,
      }).save(),
      new Notification({
        username: replacementFaculty.username,
        message: `You have been manually assigned to invigilate ${exam.examName} on ${new Date(
          slot.date
        ).toDateString()} (${slot.startTime}-${slot.endTime}).`,
        relatedExam: exam._id,
      }).save(),
    ]);

    res.status(200).json({
      message: "Manual assignment completed successfully",
      details: {
        exam: exam.examName,
        date: slot.date,
        time: `${slot.startTime}-${slot.endTime}`,
        slot: slotNumber,
        section: sectionNumber,
        originalFaculty,
        replacementFaculty: {
          username: replacementFaculty.username,
          name: replacementFaculty.name,
        },
      },
    });
  } catch (error) {
    console.error("Manual assignment error:", error);
    res.status(500).json({
      error: error.message,
      message: "Failed to complete manual assignment",
    });
  }
});

// Notify faculty
app.post("/api/notify-faculty", async (req, res) => {
  try {
    const { examId } = req.body;
    const exam = await Exam.findById(examId);

    if (!exam) {
      return res.status(404).json({ message: "Exam not found" });
    }

    const facultyUsernames = new Set();
    exam.slots.forEach((slot) => {
      slot.sections.forEach((section) => {
        section.faculty.forEach((f) => {
          if (f.username && f.username !== "no-faculty") {
            facultyUsernames.add(f.username);
          }
        });
      });
    });

    const notificationPromises = [];
    for (const username of facultyUsernames) {
      const notification = new Notification({
        username,
        message: `You have been assigned to invigilate ${exam.examName}. Please check your schedule.`,
        relatedExam: exam._id,
      });
      notificationPromises.push(notification.save());
    }

    await Promise.all(notificationPromises);

    res.status(200).json({ message: "Notifications sent to faculty" });
  } catch (error) {
    console.error("Notify faculty error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Mark exams as completed
app.put("/api/exams/mark-completed", async (req, res) => {
  try {
    const now = new Date();
    const result = await Exam.updateMany(
      {
        status: "Scheduled",
        date: { $lt: now },
      },
      { $set: { status: "Completed" } }
    );

    await Invigilation.updateMany(
      {
        status: { $in: ["Assigned", "Confirmed", "Swapped"] },
        date: { $lt: now },
      },
      { $set: { status: "Completed" } }
    );

    res.status(200).json({
      message: "Marked past exams and invigilations as completed",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Mark completed error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get notifications for user
app.get("/api/notifications/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const notifications = await Notification.find({ username })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(notifications);
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Mark notification as read
app.put("/api/notifications/:id/read", async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { status: "Read" });
    res.status(200).json({ message: "Notification marked as read" });
  } catch (error) {
    console.error("Mark notification error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get past exams for admin
app.get("/api/exams/past", async (req, res) => {
  try {
    const now = new Date();
    const pastExams = await Exam.find({
      date: { $lt: now },
      status: "Completed",
    }).sort({ date: -1 });

    res.status(200).json(pastExams);
  } catch (error) {
    console.error("Get past exams error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get past invigilations for faculty
app.get("/api/faculty/past-invigilations/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const now = new Date();

    const pastInvigilations = await Invigilation.find({
      username,
      $or: [
        { date: { $lt: now } },
        {
          date: { $gte: now.setHours(0, 0, 0, 0), $lte: now },
          endTime: {
            $lte: `${now.getHours()}:${now.getMinutes().toString().padStart(2, "0")}`,
          },
        },
      ],
    })
      .populate("examId")
      .sort({ date: -1 })
      .lean();

    res.status(200).json(pastInvigilations);
  } catch (error) {
    console.error("Get past invigilations error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get detailed exam information for admin
app.get("/api/exams/:id/details", async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) {
      return res.status(404).json({ message: "Exam not found" });
    }

    const invigilations = await Invigilation.find({ examId: exam._id });

    const response = {
      examName: exam.examName,
      examType: exam.examType,
      year: exam.year,
      date: exam.date,
      status: exam.status,
      slots: exam.slots.map((slot) => ({
        slotNumber: slot.slotNumber,
        subject: slot.subject,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        sections: slot.sections.map((section) => ({
          sectionNumber: section.sectionNumber,
          faculty: section.faculty.map((f) => ({
            username: f.username,
            name: f.name,
            status: f.status,
          })),
        })),
      })),
      invigilations: invigilations.map((inv) => ({
        username: inv.username,
        date: inv.date,
        startTime: inv.startTime,
        endTime: inv.endTime,
        venue: inv.venue,
        status: inv.status,
      })),
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Get exam details error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get faculty's past invigilation details
app.get("/api/faculty/invigilation-details/:id", async (req, res) => {
  try {
    const invigilation = await Invigilation.findById(req.params.id).populate(
      "examId"
    );

    if (!invigilation) {
      return res.status(404).json({ message: "Invigilation not found" });
    }

    const response = {
      examName: invigilation.examName,
      examType: invigilation.examType,
      date: invigilation.date,
      startTime: invigilation.startTime,
      endTime: invigilation.endTime,
      venue: invigilation.venue,
      status: invigilation.status,
      examDetails: invigilation.examId
        ? {
            examName: invigilation.examId.examName,
            examType: invigilation.examId.examType,
            year: invigilation.examId.year,
          }
        : null,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Get invigilation details error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));