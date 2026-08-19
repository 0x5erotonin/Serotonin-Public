import React, { useState } from 'react';
import { 
  CheckSquare, ArrowLeft, Upload, Mail, FolderOpen, Search,
  Brain, FileText, AlertCircle, CheckCircle, Clock, ChevronRight,
  X, Download, Send, ExternalLink
} from 'lucide-react';

// Serotonin Questionnaire Editor
// Created and Owned by Blayqe Forbes
// Copyright © 2025 Blayqe Forbes. All Rights Reserved.

export default function QuestionnaireEditor() {
  const [currentStep, setCurrentStep] = useState('intake'); // intake, processing, review, approval, complete
  const [questionnaireSource, setQuestionnaireSource] = useState(null);
  const [vendorName, setVendorName] = useState('');
  const [processingStatus, setProcessingStatus] = useState({
    totalQuestions: 0,
    processed: 0,
    autoFilled: 0,
    flagged: 0,
    documentsAttached: []
  });

  // Sample data for demo
  const [questions, setQuestions] = useState([
    {
      id: 1,
      text: 'Does your organization maintain SOC 2 Type II compliance?',
      answer: 'Yes, our organization maintains current SOC 2 Type II certification. Our most recent audit was completed in Q3 2024 with zero findings.',
      confidence: 95,
      source: 'Vanta - Compliance Dashboard',
      status: 'auto-filled'
    },
    {
      id: 2,
      text: 'What is your organization\'s mean time to detect (MTTD) for security incidents?',
      answer: 'Our SOC team maintains 24/7 monitoring with an average MTTD of 15-30 minutes based on SIEM alerting configuration.',
      confidence: 65,
      source: 'SOC 2 Report (Section 4.2) - Estimated',
      status: 'flagged',
      flagReason: 'Could not find exact MTTD metric. Answer estimated from SOC 2 documentation.',
      recommendation: 'Verify exact MTTD with SOC team before sending.'
    },
    {
      id: 3,
      text: 'Describe your data backup and recovery procedures.',
      answer: 'We perform automated daily backups with 7-day retention for operational data and 90-day retention for compliance data. All backups are encrypted at rest using AES-256.',
      confidence: 92,
      source: 'Google Drive - Backup & Recovery Policy',
      status: 'auto-filled'
    },
    {
      id: 4,
      text: 'Do you have a dedicated Chief Information Security Officer (CISO)?',
      answer: '',
      confidence: 0,
      source: '',
      status: 'needs-input',
      flagReason: 'No information found in available sources.',
      recommendation: 'Manual input required - check org chart.'
    }
  ]);

  const handleSourceSelect = (source) => {
    setQuestionnaireSource(source);
    // Simulate processing
    setTimeout(() => {
      setCurrentStep('processing');
      simulateProcessing();
    }, 500);
  };

  const simulateProcessing = () => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 1;
      setProcessingStatus(prev => ({
        ...prev,
        totalQuestions: 45,
        processed: Math.min(progress, 45),
        autoFilled: Math.min(Math.floor(progress * 0.84), 38),
        flagged: Math.min(Math.floor(progress * 0.15), 7),
        documentsAttached: progress > 30 ? ['SOC 2 Type II', 'Security Policy', 'BAA Template'] : []
      }));
      
      if (progress >= 45) {
        clearInterval(interval);
        setTimeout(() => setCurrentStep('review'), 1000);
      }
    }, 100);
  };

  const handleApprove = () => {
    setCurrentStep('approval');
  };

  const handleSend = () => {
    setCurrentStep('complete');
  };

  const renderIntakeStep = () => (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">Complete Questionnaire</h2>
        <p className="text-gray-500">Where is the security questionnaire you'd like to complete?</p>
      </div>

      {/* Vendor Name Input */}
      <div className="mb-8">
        <label className="block text-sm font-medium mb-2">Vendor Name</label>
        <input
          type="text"
          value={vendorName}
          onChange={(e) => setVendorName(e.target.value)}
          placeholder="e.g., Acme Corp, GlobalTech Solutions"
          className="w-full bg-[#111418] border border-gray-900/50 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20"
        />
      </div>

      {/* Source Selection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <button
          onClick={() => handleSourceSelect('gmail')}
          className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 hover:border-cyan-500/30 transition-all text-left group"
        >
          <div className="flex items-start gap-4">
            <div className="bg-cyan-500/10 w-12 h-12 rounded-lg flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
              <Mail className="w-6 h-6 text-cyan-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Gmail</h3>
              <p className="text-sm text-gray-500">Search your inbox for the questionnaire email</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-cyan-400 transition-colors" />
          </div>
        </button>

        <button
          onClick={() => handleSourceSelect('drive')}
          className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 hover:border-cyan-500/30 transition-all text-left group"
        >
          <div className="flex items-start gap-4">
            <div className="bg-cyan-500/10 w-12 h-12 rounded-lg flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
              <FolderOpen className="w-6 h-6 text-cyan-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Google Drive</h3>
              <p className="text-sm text-gray-500">Select a questionnaire from your Drive</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-cyan-400 transition-colors" />
          </div>
        </button>

        <button
          onClick={() => handleSourceSelect('upload')}
          className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 hover:border-cyan-500/30 transition-all text-left group"
        >
          <div className="flex items-start gap-4">
            <div className="bg-cyan-500/10 w-12 h-12 rounded-lg flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
              <Upload className="w-6 h-6 text-cyan-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Upload File</h3>
              <p className="text-sm text-gray-500">Upload a Word, Excel, or PDF file</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-cyan-400 transition-colors" />
          </div>
        </button>

        <button
          onClick={() => handleSourceSelect('manual')}
          className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 hover:border-cyan-500/30 transition-all text-left group"
        >
          <div className="flex items-start gap-4">
            <div className="bg-cyan-500/10 w-12 h-12 rounded-lg flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
              <FileText className="w-6 h-6 text-cyan-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Manual Entry</h3>
              <p className="text-sm text-gray-500">Copy and paste questions manually</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-cyan-400 transition-colors" />
          </div>
        </button>
      </div>

      {/* Info Box */}
      <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-4">
        <div className="flex gap-3">
          <Brain className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-cyan-400 font-medium mb-1">Serotonin will automatically:</p>
            <ul className="text-gray-400 space-y-1">
              <li>• Search Vanta and Google Drive for answers</li>
              <li>• Auto-fill high-confidence questions (≥85%)</li>
              <li>• Flag uncertain answers for your review</li>
              <li>• Attach relevant documentation (SOC 2, policies, etc.)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  const renderProcessingStep = () => (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-cyan-500/10 rounded-full mb-4">
          <Brain className="w-8 h-8 text-cyan-400 animate-pulse" />
        </div>
        <h2 className="text-3xl font-bold mb-2">Processing Questionnaire</h2>
        <p className="text-gray-500">Serotonin is analyzing questions and searching for answers...</p>
      </div>

      {/* Progress Stats */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 text-center">
          <div className="text-3xl font-bold text-cyan-400 mb-1">
            {processingStatus.processed}/{processingStatus.totalQuestions}
          </div>
          <div className="text-sm text-gray-500">Questions Processed</div>
        </div>
        <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 text-center">
          <div className="text-3xl font-bold text-green-400 mb-1">
            {processingStatus.autoFilled}
          </div>
          <div className="text-sm text-gray-500">Auto-Filled</div>
        </div>
        <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 text-center">
          <div className="text-3xl font-bold text-yellow-400 mb-1">
            {processingStatus.flagged}
          </div>
          <div className="text-sm text-gray-500">Flagged for Review</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Overall Progress</span>
          <span className="text-sm text-cyan-400 font-medium">
            {Math.round((processingStatus.processed / processingStatus.totalQuestions) * 100)}%
          </span>
        </div>
        <div className="h-2 bg-gray-900 rounded-full overflow-hidden">
          <div 
            className="h-full bg-cyan-400 rounded-full transition-all duration-300"
            style={{ width: `${(processingStatus.processed / processingStatus.totalQuestions) * 100}%` }}
          />
        </div>
      </div>

      {/* Activity Log */}
      <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-6">
        <h3 className="font-semibold mb-4">Activity Log</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3 text-gray-400">
            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            <span>Questionnaire parsed successfully - 45 questions identified</span>
          </div>
          <div className="flex items-start gap-3 text-gray-400">
            <Search className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <span>Searching Vanta for compliance data...</span>
          </div>
          <div className="flex items-start gap-3 text-gray-400">
            <Search className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <span>Searching Google Drive for security policies...</span>
          </div>
          {processingStatus.documentsAttached.length > 0 && (
            <div className="flex items-start gap-3 text-gray-400">
              <FileText className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
              <span>Found and attached: {processingStatus.documentsAttached.join(', ')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderReviewStep = () => (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">Review Questionnaire</h2>
        <p className="text-gray-500">Review auto-filled answers and resolve flagged items</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-4">
          <div className="text-2xl font-bold mb-1">45</div>
          <div className="text-xs text-gray-500">Total Questions</div>
        </div>
        <div className="bg-[#111418] border border-green-500/20 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-400 mb-1">38</div>
          <div className="text-xs text-gray-500">Auto-Filled (84%)</div>
        </div>
        <div className="bg-[#111418] border border-yellow-500/20 rounded-lg p-4">
          <div className="text-2xl font-bold text-yellow-400 mb-1">6</div>
          <div className="text-xs text-gray-500">Flagged (13%)</div>
        </div>
        <div className="bg-[#111418] border border-red-500/20 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-400 mb-1">1</div>
          <div className="text-xs text-gray-500">Needs Input (2%)</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-4 mb-6 border-b border-gray-900/50">
        <button className="px-4 py-2 text-sm font-medium text-cyan-400 border-b-2 border-cyan-400">
          All Questions (45)
        </button>
        <button className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-300">
          Flagged Only (6)
        </button>
        <button className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-300">
          Needs Input (1)
        </button>
      </div>

      {/* Questions List */}
      <div className="space-y-4 mb-8">
        {questions.map((q) => (
          <div 
            key={q.id}
            className={`bg-[#111418] border rounded-lg p-6 ${
              q.status === 'flagged' ? 'border-yellow-500/30' :
              q.status === 'needs-input' ? 'border-red-500/30' :
              'border-gray-900/50'
            }`}
          >
            {/* Question Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono text-gray-600">Q{q.id}</span>
                  {q.status === 'auto-filled' && (
                    <span className="px-2 py-0.5 bg-green-500/10 text-green-400 text-xs rounded-full flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Auto-filled
                    </span>
                  )}
                  {q.status === 'flagged' && (
                    <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-400 text-xs rounded-full flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Review Required
                    </span>
                  )}
                  {q.status === 'needs-input' && (
                    <span className="px-2 py-0.5 bg-red-500/10 text-red-400 text-xs rounded-full flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Manual Input
                    </span>
                  )}
                  <span className="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 text-xs rounded-full">
                    {q.confidence}% confidence
                  </span>
                </div>
                <h4 className="font-medium mb-3">{q.text}</h4>
              </div>
            </div>

            {/* Answer */}
            <div className="mb-4">
              <textarea
                value={q.answer}
                onChange={(e) => {
                  const updated = questions.map(qu => 
                    qu.id === q.id ? {...qu, answer: e.target.value} : qu
                  );
                  setQuestions(updated);
                }}
                placeholder="Enter answer..."
                className="w-full bg-[#0B0F13] border border-gray-900/50 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 min-h-[100px]"
              />
            </div>

            {/* Source & Metadata */}
            <div className="flex items-center justify-between text-xs text-gray-500">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {q.source || 'No source'}
                </span>
              </div>
            </div>

            {/* Flag Info */}
            {q.status === 'flagged' && (
              <div className="mt-4 pt-4 border-t border-yellow-500/20">
                <div className="bg-yellow-500/5 rounded-lg p-3">
                  <div className="flex gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-medium text-yellow-400 mb-1">Why Flagged:</div>
                      <div className="text-sm text-gray-400">{q.flagReason}</div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-400 mt-2">
                    <strong className="text-cyan-400">Recommendation:</strong> {q.recommendation}
                  </div>
                </div>
              </div>
            )}

            {q.status === 'needs-input' && (
              <div className="mt-4 pt-4 border-t border-red-500/20">
                <div className="bg-red-500/5 rounded-lg p-3">
                  <div className="flex gap-2">
                    <Clock className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-medium text-red-400 mb-1">Manual Input Required:</div>
                      <div className="text-sm text-gray-400">{q.flagReason}</div>
                      <div className="text-sm text-gray-400 mt-2">
                        <strong className="text-cyan-400">Recommendation:</strong> {q.recommendation}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-6 border-t border-gray-900/50">
        <button 
          onClick={() => setCurrentStep('intake')}
          className="text-gray-500 hover:text-gray-300 text-sm flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Source Selection
        </button>
        <button
          onClick={handleApprove}
          className="bg-cyan-500 hover:bg-cyan-600 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors"
        >
          Approve & Continue
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const renderApprovalStep = () => (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">Final Approval</h2>
        <p className="text-gray-500">Review the complete package before sending</p>
      </div>

      {/* Summary Card */}
      <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 mb-6">
        <h3 className="font-semibold mb-4">Questionnaire Summary</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-sm text-gray-500 mb-1">Vendor</div>
            <div className="font-medium">{vendorName || 'Acme Corp'}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">Total Questions</div>
            <div className="font-medium">45</div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">Completion Rate</div>
            <div className="font-medium text-green-400">100%</div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">Documents Attached</div>
            <div className="font-medium">3</div>
          </div>
        </div>
      </div>

      {/* Attached Documents */}
      <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 mb-6">
        <h3 className="font-semibold mb-4">Attached Documents</h3>
        <div className="space-y-3">
          {['SOC 2 Type II Report (2024)', 'Information Security Policy', 'Business Associate Agreement Template'].map((doc, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 bg-[#0B0F13] rounded-lg border border-gray-900/30">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-cyan-400" />
                <span className="text-sm">{doc}</span>
              </div>
              <button className="text-cyan-400 hover:text-cyan-300 text-sm">
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Email Draft */}
      <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 mb-6">
        <h3 className="font-semibold mb-4">Email Draft</h3>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-500 mb-2 block">To:</label>
            <input
              type="email"
              defaultValue="security@acmecorp.com"
              className="w-full bg-[#0B0F13] border border-gray-900/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500 mb-2 block">Subject:</label>
            <input
              type="text"
              defaultValue="Completed Security Questionnaire - [Your Company]"
              className="w-full bg-[#0B0F13] border border-gray-900/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500 mb-2 block">Message:</label>
            <textarea
              defaultValue={`Hello,

Please find our completed security questionnaire attached, along with supporting documentation including our SOC 2 Type II report and security policies.

All questions have been thoroughly reviewed and answered. Please let us know if you need any additional information or clarification.

Best regards,
[Your Name]`}
              className="w-full bg-[#0B0F13] border border-gray-900/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50 min-h-[200px]"
            />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-6 border-t border-gray-900/50">
        <button 
          onClick={() => setCurrentStep('review')}
          className="text-gray-500 hover:text-gray-300 text-sm flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Review
        </button>
        <div className="flex gap-3">
          <button className="bg-[#111418] border border-gray-900/50 hover:border-cyan-500/30 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors">
            <Download className="w-4 h-4" />
            Download PDF
          </button>
          <button
            onClick={handleSend}
            className="bg-cyan-500 hover:bg-cyan-600 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            <Send className="w-4 h-4" />
            Send Email
          </button>
        </div>
      </div>
    </div>
  );

  const renderCompleteStep = () => (
    <div className="max-w-2xl mx-auto text-center py-12">
      <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/10 rounded-full mb-6">
        <CheckCircle className="w-10 h-10 text-green-400" />
      </div>
      <h2 className="text-3xl font-bold mb-4">Questionnaire Sent!</h2>
      <p className="text-gray-500 mb-8">
        Your completed questionnaire has been sent to {vendorName || 'Acme Corp'}.
      </p>

      {/* Summary Stats */}
      <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 mb-8">
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="text-2xl font-bold text-cyan-400 mb-1">45</div>
            <div className="text-sm text-gray-500">Questions Answered</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-400 mb-1">~3.5hrs</div>
            <div className="text-sm text-gray-500">Time Saved</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-purple-400 mb-1">3</div>
            <div className="text-sm text-gray-500">Docs Attached</div>
          </div>
        </div>
      </div>

      <button
        onClick={() => {
          setCurrentStep('intake');
          setVendorName('');
          setQuestionnaireSource(null);
        }}
        className="bg-cyan-500 hover:bg-cyan-600 text-white px-8 py-3 rounded-lg font-medium transition-colors"
      >
        Complete Another Questionnaire
      </button>
    </div>
  );

  return (
    <div style={{ 
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: '#0B0F13',
      overflow: 'auto'
    }}>
      <div className="min-h-screen text-white" style={{ backgroundColor: '#0B0F13' }}>
        {/* Header */}
        <header className="border-b border-gray-900/50 bg-[#111418]">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => window.history.back()}
                  className="text-gray-500 hover:text-gray-300"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h1 className="text-xl font-semibold">Questionnaire Editor</h1>
                  <p className="text-sm text-gray-500">Complete security questionnaires with AI assistance</p>
                </div>
              </div>
              
              {/* Progress Steps */}
              <div className="flex items-center gap-2">
                <div className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                  currentStep === 'intake' ? 'bg-cyan-500 text-white' : 
                  'bg-gray-900 text-gray-500'
                }`}>
                  1. Source
                </div>
                <div className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                  currentStep === 'processing' ? 'bg-cyan-500 text-white' : 
                  currentStep === 'review' || currentStep === 'approval' || currentStep === 'complete' ? 'bg-green-500/20 text-green-400' :
                  'bg-gray-900 text-gray-500'
                }`}>
                  2. Process
                </div>
                <div className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                  currentStep === 'review' ? 'bg-cyan-500 text-white' : 
                  currentStep === 'approval' || currentStep === 'complete' ? 'bg-green-500/20 text-green-400' :
                  'bg-gray-900 text-gray-500'
                }`}>
                  3. Review
                </div>
                <div className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                  currentStep === 'approval' ? 'bg-cyan-500 text-white' : 
                  currentStep === 'complete' ? 'bg-green-500/20 text-green-400' :
                  'bg-gray-900 text-gray-500'
                }`}>
                  4. Approve
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-6 py-12">
          {currentStep === 'intake' && renderIntakeStep()}
          {currentStep === 'processing' && renderProcessingStep()}
          {currentStep === 'review' && renderReviewStep()}
          {currentStep === 'approval' && renderApprovalStep()}
          {currentStep === 'complete' && renderCompleteStep()}
        </main>

        {/* Footer */}
        <div className="mt-auto py-6 text-center text-xs text-gray-700 border-t border-gray-900/50">
          Created and Owned by Blayqe Forbes • Copyright © 2025 All Rights Reserved
        </div>
      </div>
    </div>
  );
}
