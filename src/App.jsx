import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { PrefsProvider } from './context/Prefs.jsx';
import AppShell from './components/layout/AppShell.jsx';

// Pages
import StudentHome from './pages/student/StudentHome.jsx';
import StudentDocument from './pages/student/StudentDocument.jsx';
import StudentQuiz from './pages/student/StudentQuiz.jsx';
import StudentChat from './pages/student/StudentChat.jsx';
import StudentReview from './pages/student/StudentReview.jsx';
import StudentDashboard from './pages/student/StudentDashboard.jsx';
import StudentVerify from './pages/student/StudentVerify.jsx';
import StudentProfile from './pages/student/StudentProfile.jsx';
import StudentQuizPicker from './pages/student/StudentQuizPicker.jsx';

export default function App() {
  return (
    <PrefsProvider>
      <AppShell>
        <Routes>
          {/* Student home is the landing page */}
          <Route path="/" element={<Navigate to="/student" replace />} />

          {/* Workspace: Home, Review, Quiz, Profile */}
          <Route path="/student" element={<StudentHome />} />
          <Route path="/student/review" element={<StudentReview />} />
          <Route path="/student/quiz" element={<StudentQuizPicker />} />
          <Route path="/student/profile" element={<StudentProfile />} />

          {/* Per-document screens */}
          <Route path="/student/document/:id" element={<StudentDocument />} />
          <Route path="/student/document/:id/quiz" element={<StudentQuiz />} />
          <Route path="/student/document/:id/chat" element={<StudentChat />} />
          <Route path="/student/document/:id/review" element={<StudentReview />} />
          <Route path="/student/document/:id/dashboard" element={<StudentDashboard />} />
          <Route path="/student/document/:id/verify" element={<StudentVerify />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/student" replace />} />
        </Routes>
      </AppShell>
    </PrefsProvider>
  );
}
