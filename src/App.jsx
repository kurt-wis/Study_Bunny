import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Pages
import StudentHome from './pages/student/StudentHome.jsx';
import StudentDocument from './pages/student/StudentDocument.jsx';
import StudentQuiz from './pages/student/StudentQuiz.jsx';
import StudentChat from './pages/student/StudentChat.jsx';
import StudentReview from './pages/student/StudentReview.jsx';
import StudentDashboard from './pages/student/StudentDashboard.jsx';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Routes>
        {/* Student home is the landing page */}
        <Route path="/" element={<Navigate to="/student" replace />} />

        {/* Student Mode */}
        <Route path="/student" element={<StudentHome />} />
        <Route path="/student/document/:id" element={<StudentDocument />} />
        <Route path="/student/document/:id/quiz" element={<StudentQuiz />} />
        <Route path="/student/document/:id/chat" element={<StudentChat />} />
        <Route path="/student/document/:id/review" element={<StudentReview />} />
        <Route path="/student/document/:id/dashboard" element={<StudentDashboard />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/student" replace />} />
      </Routes>
    </div>
  );
}
