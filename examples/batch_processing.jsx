import React, { useState } from 'react';
import { 
  ArrowLeft, Upload, Mail, FolderOpen, Plus, X, Clock,
  CheckCircle, AlertCircle, Play, Pause, SkipForward, Settings,
  Calendar, TrendingUp, BarChart3, Filter, Download, FileText,
  ChevronRight, ChevronDown, Layers, Brain, Activity
} from 'lucide-react';

// Serotonin Batch Processing Queue
// Created and Owned by Blayqe Forbes
// Copyright © 2025 Blayqe Forbes. All Rights Reserved.

export default function BatchProcessing() {
  const [currentView, setCurrentView] = useState('queue'); // queue, setup, processing, complete
  const [queueStatus, setQueueStatus] = useState('idle'); // idle, running, paused
  const [selectedItems, setSelectedItems] = useState([]);
  
  const [batchQueue] = useState([
    {
      id: 1,
      vendor: 'Acme Healthcare Solutions',
      source: 'Gmail',
      priority: 1,
      deadline: '2024-05-15',
      questions: 45,
      status: 'queued',
      progress: 0,
      timeEstimate: '25 min'
    },
    {
      id: 2,
      vendor: 'MedTech Systems',
      source: 'Google Drive',
      priority: 2,
      deadline: '2024-05-18',
      questions: 38,
      status: 'queued',
      progress: 0,
      timeEstimate: '20 min'
    },
    {
      id: 3,
      vendor: 'Cloud Backup Co',
      source: 'Upload',
      priority: 3,
      deadline: '2024-05-20',
      questions: 52,
      status: 'queued',
      progress: 0,
      timeEstimate: '30 min'
    },
    {
      id: 4,
      vendor: 'Analytics Platform Inc',
      source: 'Gmail',
      priority: 4,
      deadline: '2024-05-22',
      questions: 41,
      status: 'queued',
      progress: 0,
      timeEstimate: '23 min'
    },
    {
      id: 5,
      vendor: 'Consulting Firm LLC',
      source: 'Google Drive',
      priority: 5,
      deadline: '2024-05-28',
      questions: 35,
      status: 'queued',
      progress: 0,
      timeEstimate: '18 min'
    }
  ]);

  const [completedBatch] = useState([
    {
      id: 101,
      vendor: 'SecureData Corp',
      completedDate: '2024-05-10',
      questions: 48,
      autoFilled: 42,
      flagged: 6,
      timeTaken: '22 min',
      status: 'completed'
    },
    {
      id: 102,
      vendor: 'TechVendor Solutions',
      completedDate: '2024-05-08',
      questions: 55,
      autoFilled: 48,
      flagged: 7,
      timeTaken: '28 min',
      status: 'completed'
    }
  ]);

  const [processingState, setProcessingState] = useState({
    currentItem: 1,
    totalItems: 5,
    currentVendor: 'Acme Healthcare Solutions',
    currentProgress: 0,
    totalProgress: 0,
    completed: 0,
    failed: 0,
    estimatedTimeRemaining: '1h 56m'
  });

  const handleStartBatch = () => {
    setCurrentView('processing');
    setQueueStatus('running');
    // Simulate processing
    simulateProcessing();
  };

  const simulateProcessing = () => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 2;
      setProcessingState(prev => ({
        ...prev,
        currentProgress: Math.min(progress, 100),
        totalProgress: Math.min(progress / 5, 100),
        completed: Math.floor(progress / 100)
      }));
      
      if (progress >= 500) {
        clearInterval(interval);
        setCurrentView('complete');
      }
    }, 100);
  };

  const handlePauseBatch = () => {
    setQueueStatus('paused');
  };

  const handleResumeBatch = () => {
    setQueueStatus('running');
  };

  const getPriorityColor = (priority) => {
    if (priority === 1) return 'text-red-400 bg-red-500/10';
    if (priority <= 3) return 'text-yellow-400 bg-yellow-500/10';
    return 'text-gray-400 bg-gray-500/10';
  };

  const renderQueueView = () => (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-3xl font-bold mb-2">Batch Processing Queue</h2>
            <p className="text-gray-500">Process multiple questionnaires automatically</p>
          </div>
          <div className="flex gap-3">
            <button className="bg-[#111418] border border-gray-900/50 hover:border-cyan-500/30 px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors">
              <Plus className="w-4 h-4" />
              Add to Queue
            </button>
            <button 
              onClick={handleStartBatch}
              disabled={batchQueue.length === 0}
              className="bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
              <Play className="w-4 h-4" />
              Start Batch Processing
            </button>
          </div>
        </div>
      </div>

      {/* Queue Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-gray-500">IN QUEUE</span>
          </div>
          <div className="text-2xl font-bold">{batchQueue.length}</div>
          <div className="text-xs text-gray-500 mt-1">questionnaires</div>
        </div>
        <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-gray-500">TOTAL QUESTIONS</span>
          </div>
          <div className="text-2xl font-bold">{batchQueue.reduce((sum, item) => sum + item.questions, 0)}</div>
          <div className="text-xs text-gray-500 mt-1">to process</div>
        </div>
        <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-yellow-400" />
            <span className="text-xs text-gray-500">EST. TIME</span>
          </div>
          <div className="text-2xl font-bold">~1h 56m</div>
          <div className="text-xs text-gray-500 mt-1">total processing</div>
        </div>
        <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <span className="text-xs text-gray-500">EFFICIENCY</span>
          </div>
          <div className="text-2xl font-bold text-green-400">80%</div>
          <div className="text-xs text-gray-500 mt-1">time saved</div>
        </div>
      </div>

      {/* Queue Settings */}
      <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Processing Settings</h3>
          <button className="text-cyan-400 text-sm hover:underline flex items-center gap-1">
            <Settings className="w-4 h-4" />
            Configure
          </button>
        </div>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="text-sm text-gray-500 mb-2">Priority Mode</div>
            <div className="bg-[#0B0F13] border border-gray-900/50 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Deadline-based</span>
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </div>
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-2">Confidence Threshold</div>
            <div className="bg-[#0B0F13] border border-gray-900/50 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">85% (Standard)</span>
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </div>
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-2">Auto-attach Documents</div>
            <div className="bg-[#0B0F13] border border-gray-900/50 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Enabled</span>
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Queue List */}
      <div className="bg-[#111418] border border-gray-900/50 rounded-lg overflow-hidden mb-8">
        <div className="bg-[#0B0F13] border-b border-gray-900/50 px-6 py-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Processing Queue</h3>
            <div className="flex items-center gap-3">
              <button className="text-gray-500 hover:text-gray-300 text-sm flex items-center gap-1">
                <Filter className="w-4 h-4" />
                Filter
              </button>
              <span className="text-sm text-gray-500">Sorted by: Priority</span>
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-900/30">
          {batchQueue.map((item, index) => (
            <div 
              key={item.id}
              className="px-6 py-4 hover:bg-[#0B0F13] transition-colors"
            >
              <div className="flex items-center gap-4">
                {/* Priority Badge */}
                <div className="flex-shrink-0">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold ${getPriorityColor(item.priority)}`}>
                    {item.priority}
                  </div>
                </div>

                {/* Vendor Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold">{item.vendor}</h4>
                    <span className="px-2 py-0.5 bg-gray-900 text-gray-400 text-xs rounded-full">
                      {item.source}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {item.questions} questions
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Due {item.deadline}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      ~{item.timeEstimate}
                    </span>
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-gray-900 text-gray-400 text-xs rounded-full font-medium">
                    QUEUED
                  </span>
                  <button className="text-gray-500 hover:text-red-400 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recently Completed */}
      {completedBatch.length > 0 && (
        <div>
          <h3 className="font-semibold mb-4">Recently Completed</h3>
          <div className="space-y-3">
            {completedBatch.map((item) => (
              <div 
                key={item.id}
                className="bg-[#111418] border border-green-500/20 rounded-lg p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-green-500/10 w-10 h-10 rounded-lg flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <h4 className="font-semibold mb-1">{item.vendor}</h4>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{item.questions} questions</span>
                        <span>•</span>
                        <span>{item.autoFilled} auto-filled</span>
                        <span>•</span>
                        <span>{item.flagged} flagged</span>
                        <span>•</span>
                        <span>Completed {item.completedDate}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-green-400">{item.timeTaken}</div>
                    <div className="text-xs text-gray-500">processing time</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderProcessingView = () => (
    <div className="max-w-5xl mx-auto">
      {/* Overall Progress */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-cyan-500/10 rounded-full mb-4">
          <Brain className="w-8 h-8 text-cyan-400 animate-pulse" />
        </div>
        <h2 className="text-3xl font-bold mb-2">Batch Processing in Progress</h2>
        <p className="text-gray-500">
          Processing {processingState.currentItem} of {processingState.totalItems} questionnaires
        </p>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-cyan-400 mb-1">
            {processingState.currentItem}/{processingState.totalItems}
          </div>
          <div className="text-sm text-gray-500">Current Item</div>
        </div>
        <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-green-400 mb-1">
            {processingState.completed}
          </div>
          <div className="text-sm text-gray-500">Completed</div>
        </div>
        <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-yellow-400 mb-1">
            {processingState.totalItems - processingState.completed}
          </div>
          <div className="text-sm text-gray-500">Remaining</div>
        </div>
        <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-purple-400 mb-1">
            {processingState.estimatedTimeRemaining}
          </div>
          <div className="text-sm text-gray-500">Time Left</div>
        </div>
      </div>

      {/* Current Processing */}
      <div className="bg-[#111418] border border-cyan-500/30 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm text-cyan-400 mb-1">NOW PROCESSING</div>
            <h3 className="text-xl font-bold">{processingState.currentVendor}</h3>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-cyan-400">
              {processingState.currentProgress}%
            </div>
            <div className="text-sm text-gray-500">Progress</div>
          </div>
        </div>
        <div className="h-3 bg-gray-900 rounded-full overflow-hidden mb-4">
          <div 
            className="h-full bg-cyan-400 rounded-full transition-all duration-300"
            style={{ width: `${processingState.currentProgress}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>Questions: 45 total</span>
          <span>Auto-filled: 38 • Flagged: 7</span>
        </div>
      </div>

      {/* Overall Batch Progress */}
      <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Overall Batch Progress</span>
          <span className="text-sm text-cyan-400 font-medium">
            {Math.round(processingState.totalProgress)}%
          </span>
        </div>
        <div className="h-2 bg-gray-900 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-cyan-400 to-purple-400 rounded-full transition-all duration-300"
            style={{ width: `${processingState.totalProgress}%` }}
          />
        </div>
      </div>

      {/* Activity Log */}
      <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 mb-6">
        <h3 className="font-semibold mb-4">Activity Log</h3>
        <div className="space-y-3 max-h-64 overflow-y-auto">
          <div className="flex items-start gap-3 text-sm">
            <Activity className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="text-gray-400">Processing question 38/45 for </span>
              <span className="text-white font-medium">{processingState.currentVendor}</span>
            </div>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="text-gray-400">Auto-filled: "What is your data backup frequency?" - </span>
              <span className="text-green-400">95% confidence</span>
            </div>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="text-gray-400">Flagged: "What is your MTTD for security incidents?" - </span>
              <span className="text-yellow-400">65% confidence</span>
            </div>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <FileText className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="text-gray-400">Attached document: </span>
              <span className="text-purple-400">SOC 2 Type II Report</span>
            </div>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="text-gray-400">Searching Google Drive for backup policies...</span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex justify-center gap-3">
        {queueStatus === 'running' ? (
          <button 
            onClick={handlePauseBatch}
            className="bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/20 text-yellow-400 px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            <Pause className="w-4 h-4" />
            Pause Batch
          </button>
        ) : (
          <button 
            onClick={handleResumeBatch}
            className="bg-cyan-500 hover:bg-cyan-600 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            <Play className="w-4 h-4" />
            Resume Batch
          </button>
        )}
        <button className="bg-[#111418] border border-gray-900/50 hover:border-red-500/30 text-gray-300 hover:text-red-400 px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors">
          <SkipForward className="w-4 h-4" />
          Skip Current
        </button>
      </div>
    </div>
  );

  const renderCompleteView = () => (
    <div className="max-w-4xl mx-auto text-center py-12">
      <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/10 rounded-full mb-6">
        <CheckCircle className="w-10 h-10 text-green-400" />
      </div>
      <h2 className="text-3xl font-bold mb-4">Batch Processing Complete!</h2>
      <p className="text-gray-500 mb-8">
        Successfully processed {processingState.totalItems} questionnaires
      </p>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-[#111418] border border-green-500/20 rounded-lg p-6">
          <div className="text-3xl font-bold text-green-400 mb-2">
            {processingState.totalItems}
          </div>
          <div className="text-sm text-gray-500 mb-1">Questionnaires Completed</div>
          <div className="text-xs text-gray-600">211 total questions answered</div>
        </div>
        <div className="bg-[#111418] border border-cyan-500/20 rounded-lg p-6">
          <div className="text-3xl font-bold text-cyan-400 mb-2">
            ~8.2hrs
          </div>
          <div className="text-sm text-gray-500 mb-1">Time Saved</div>
          <div className="text-xs text-gray-600">vs manual completion</div>
        </div>
        <div className="bg-[#111418] border border-purple-500/20 rounded-lg p-6">
          <div className="text-3xl font-bold text-purple-400 mb-2">
            87%
          </div>
          <div className="text-sm text-gray-500 mb-1">Avg. Auto-Fill Rate</div>
          <div className="text-xs text-gray-600">183 of 211 questions</div>
        </div>
      </div>

      {/* Completed Items List */}
      <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 mb-8 text-left">
        <h3 className="font-semibold mb-4">Completed Items</h3>
        <div className="space-y-3">
          {batchQueue.map((item) => (
            <div key={item.id} className="flex items-center justify-between p-3 bg-[#0B0F13] rounded-lg border border-green-500/20">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <div>
                  <div className="font-medium">{item.vendor}</div>
                  <div className="text-xs text-gray-500">{item.questions} questions • {item.timeEstimate} processing time</div>
                </div>
              </div>
              <button className="text-cyan-400 hover:text-cyan-300 text-sm flex items-center gap-1">
                View Details
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-3">
        <button className="bg-[#111418] border border-gray-900/50 hover:border-cyan-500/30 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors">
          <Download className="w-4 h-4" />
          Download All Reports
        </button>
        <button
          onClick={() => {
            setCurrentView('queue');
            setQueueStatus('idle');
          }}
          className="bg-cyan-500 hover:bg-cyan-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
        >
          Start New Batch
        </button>
      </div>
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
                  onClick={() => currentView === 'queue' ? window.history.back() : setCurrentView('queue')}
                  className="text-gray-500 hover:text-gray-300"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h1 className="text-xl font-semibold">Batch Processing</h1>
                  <p className="text-sm text-gray-500">Automate multiple questionnaires simultaneously</p>
                </div>
              </div>
              
              {currentView === 'processing' && (
                <div className="flex items-center gap-3">
                  <div className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 ${
                    queueStatus === 'running' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${
                      queueStatus === 'running' ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'
                    }`} />
                    {queueStatus === 'running' ? 'PROCESSING' : 'PAUSED'}
                  </div>
                  <span className="text-sm text-gray-400">
                    {processingState.currentItem} of {processingState.totalItems}
                  </span>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-6 py-12">
          {currentView === 'queue' && renderQueueView()}
          {currentView === 'processing' && renderProcessingView()}
          {currentView === 'complete' && renderCompleteView()}
        </main>

        {/* Footer */}
        <div className="mt-auto py-6 text-center text-xs text-gray-700 border-t border-gray-900/50">
          Created and Owned by Blayqe Forbes • Copyright © 2025 All Rights Reserved
        </div>
      </div>
    </div>
  );
}
