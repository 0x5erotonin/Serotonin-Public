import React, { useState } from 'react';
import { 
  ArrowLeft, Upload, FolderOpen, Search, Filter, Download,
  FileText, Calendar, Building, Tag, ExternalLink, Trash2,
  ChevronRight, ChevronDown, Grid, List, Clock, Check, X,
  BarChart3, TrendingUp, Database, RefreshCw, Settings,
  Folder, Plus, Eye, Edit, Copy, Archive, AlertTriangle,
  AlertCircle, Lock, Shield
} from 'lucide-react';

// Serotonin Knowledge Base
// Created and Owned by Blayqe Forbes
// Copyright © 2025 Blayqe Forbes. All Rights Reserved.

export default function KnowledgeBase() {
  const [currentView, setCurrentView] = useState('library'); // library, import, detail
  const [viewMode, setViewMode] = useState('grid'); // grid, list
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [importMethod, setImportMethod] = useState(null); // local, drive, bulk
  const [selectedQuestionnaire, setSelectedQuestionnaire] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [showStorageInfo, setShowStorageInfo] = useState(false);
  const [userRole, setUserRole] = useState('user'); // user, admin

  const [questionnaires] = useState([
    {
      id: 1,
      vendor: 'Acme Healthcare Solutions',
      completedDate: '2024-05-12',
      questions: 45,
      autoFilled: 38,
      flagged: 7,
      industry: 'Healthcare',
      tags: ['SOC 2', 'HIPAA', 'Cloud Services'],
      source: 'Gmail',
      confidence: 84,
      documentsAttached: ['SOC 2 Type II', 'HIPAA BAA'],
      status: 'approved'
    },
    {
      id: 2,
      vendor: 'SecureData Analytics',
      completedDate: '2024-05-10',
      questions: 52,
      autoFilled: 45,
      flagged: 7,
      industry: 'Data Analytics',
      tags: ['SOC 2', 'ISO 27001', 'Data Processing'],
      source: 'Upload',
      confidence: 87,
      documentsAttached: ['SOC 2 Type II', 'Security Policy'],
      status: 'approved'
    },
    {
      id: 3,
      vendor: 'CloudSync Solutions',
      completedDate: '2024-05-08',
      questions: 38,
      autoFilled: 32,
      flagged: 6,
      industry: 'SaaS',
      tags: ['SOC 2', 'Cloud Storage'],
      source: 'Google Drive',
      confidence: 84,
      documentsAttached: ['SOC 2 Type II'],
      status: 'conditional'
    },
    {
      id: 4,
      vendor: 'FinTech Payment Systems',
      completedDate: '2024-05-05',
      questions: 61,
      autoFilled: 54,
      flagged: 7,
      industry: 'Financial Services',
      tags: ['PCI DSS', 'SOC 2', 'Payment Processing'],
      source: 'Gmail',
      confidence: 89,
      documentsAttached: ['SOC 2 Type II', 'PCI AOC'],
      status: 'approved'
    },
    {
      id: 5,
      vendor: 'TechVendor Solutions',
      completedDate: '2024-04-28',
      questions: 55,
      autoFilled: 48,
      flagged: 7,
      industry: 'Technology',
      tags: ['SOC 2', 'ISO 27001'],
      source: 'Upload',
      confidence: 87,
      documentsAttached: ['SOC 2 Type II', 'ISO Certificate'],
      status: 'approved'
    },
    {
      id: 6,
      vendor: 'Global Logistics Corp',
      completedDate: '2024-04-22',
      questions: 42,
      autoFilled: 35,
      flagged: 7,
      industry: 'Logistics',
      tags: ['SOC 2', 'Supply Chain'],
      source: 'Google Drive',
      confidence: 83,
      documentsAttached: ['SOC 2 Type II'],
      status: 'approved'
    }
  ]);

  const [stats] = useState({
    totalQuestionnaires: 47,
    totalQuestions: 2134,
    avgConfidence: 86,
    commonTags: ['SOC 2', 'HIPAA', 'ISO 27001', 'Cloud Services', 'Data Processing'],
    recentlyAdded: 12,
    thisMonth: 8
  });

  const allTags = Array.from(new Set(questionnaires.flatMap(q => q.tags)));

  const handleImportComplete = () => {
    setCurrentView('library');
    setImportMethod(null);
  };

  const handleQuestionnaireClick = (questionnaire) => {
    setSelectedQuestionnaire(questionnaire);
    setCurrentView('detail');
  };

  const handleDeleteRequest = () => {
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = () => {
    // In real implementation, this would:
    // 1. Send delete request to admin approval queue
    // 2. Notify admin via email/Slack
    // 3. Lock the questionnaire from editing
    // 4. Show pending deletion status
    
    alert(`Delete request submitted for admin approval.\n\nReason: ${deleteReason}\n\nAn admin will review this request within 24 hours.`);
    setShowDeleteModal(false);
    setDeleteReason('');
    setCurrentView('library');
  };

  const renderDeleteModal = () => {
    if (!showDeleteModal) return null;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-[#111418] border border-red-500/30 rounded-lg max-w-md w-full p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="bg-red-500/10 w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Request Questionnaire Deletion</h3>
              <p className="text-sm text-gray-400">
                This action requires admin approval for security and compliance reasons.
              </p>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              Reason for deletion <span className="text-red-400">*</span>
            </label>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="e.g., Vendor relationship terminated, Data retention policy, Incorrect import..."
              className="w-full bg-[#0B0F13] border border-gray-900/50 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20 min-h-[100px]"
            />
          </div>

          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3 mb-6">
            <div className="flex gap-2 text-sm text-yellow-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-1">Admin Approval Required</p>
                <p className="text-xs text-gray-400">
                  Your request will be sent to the admin team for review. You'll receive a notification once approved or denied.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowDeleteModal(false);
                setDeleteReason('');
              }}
              className="flex-1 bg-[#0B0F13] border border-gray-900/50 hover:border-gray-700 px-4 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteConfirm}
              disabled={!deleteReason.trim()}
              className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Submit Request
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderStorageInfoModal = () => {
    if (!showStorageInfo) return null;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-[#111418] border border-cyan-500/30 rounded-lg max-w-3xl w-full p-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h3 className="text-2xl font-bold mb-2">Data Storage & Security</h3>
              <p className="text-gray-400">How Serotonin stores and protects your questionnaire data</p>
            </div>
            <button 
              onClick={() => setShowStorageInfo(false)}
              className="text-gray-500 hover:text-gray-300"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-6">
            {/* Storage Architecture */}
            <div className="bg-[#0B0F13] border border-gray-900/50 rounded-lg p-6">
              <div className="flex items-start gap-3 mb-4">
                <Database className="w-6 h-6 text-cyan-400 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold mb-2">Storage Architecture</h4>
                  <div className="space-y-3 text-sm text-gray-400">
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 flex-shrink-0"></div>
                      <div>
                        <strong className="text-white">Primary Storage:</strong> Encrypted cloud database (AWS RDS / Google Cloud SQL) with automatic backups every 6 hours
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 flex-shrink-0"></div>
                      <div>
                        <strong className="text-white">File Storage:</strong> Attached documents stored in encrypted object storage (AWS S3 / Google Cloud Storage) with versioning enabled
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 flex-shrink-0"></div>
                      <div>
                        <strong className="text-white">Search Index:</strong> Elasticsearch cluster for fast full-text search across all questionnaires and answers
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 flex-shrink-0"></div>
                      <div>
                        <strong className="text-white">Backup Storage:</strong> Geo-redundant backups in multiple regions with 90-day retention
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Security & Encryption */}
            <div className="bg-[#0B0F13] border border-gray-900/50 rounded-lg p-6">
              <div className="flex items-start gap-3 mb-4">
                <Lock className="w-6 h-6 text-green-400 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold mb-2">Security & Encryption</h4>
                  <div className="space-y-3 text-sm text-gray-400">
                    <div className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      <span><strong className="text-white">Encryption at Rest:</strong> AES-256 encryption for all stored data</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      <span><strong className="text-white">Encryption in Transit:</strong> TLS 1.3 for all data transfers</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      <span><strong className="text-white">Access Control:</strong> Role-based access with multi-factor authentication</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      <span><strong className="text-white">Audit Logging:</strong> All access and modifications logged for compliance</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Data Retention */}
            <div className="bg-[#0B0F13] border border-gray-900/50 rounded-lg p-6">
              <div className="flex items-start gap-3 mb-4">
                <Calendar className="w-6 h-6 text-purple-400 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold mb-2">Data Retention Policy</h4>
                  <div className="space-y-2 text-sm text-gray-400">
                    <p>
                      <strong className="text-white">Active Questionnaires:</strong> Retained indefinitely as part of your knowledge base
                    </p>
                    <p>
                      <strong className="text-white">Deleted Questionnaires:</strong> 30-day soft delete period (admin can restore), then permanent deletion with audit trail
                    </p>
                    <p>
                      <strong className="text-white">Audit Logs:</strong> Retained for 7 years for compliance purposes
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Compliance */}
            <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-4">
              <div className="flex gap-3 text-sm">
                <Shield className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-cyan-400 font-medium mb-2">Compliance Certifications</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-1 bg-cyan-500/10 rounded text-xs">SOC 2 Type II</span>
                    <span className="px-2 py-1 bg-cyan-500/10 rounded text-xs">ISO 27001</span>
                    <span className="px-2 py-1 bg-cyan-500/10 rounded text-xs">HIPAA Compliant</span>
                    <span className="px-2 py-1 bg-cyan-500/10 rounded text-xs">GDPR Ready</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setShowStorageInfo(false)}
              className="bg-cyan-500 hover:bg-cyan-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  };

  const filteredQuestionnaires = questionnaires.filter(q => {
    const matchesSearch = searchQuery === '' || 
      q.vendor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.industry.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesTags = selectedTags.length === 0 || 
      selectedTags.every(tag => q.tags.includes(tag));
    
    return matchesSearch && matchesTags;
  });

  const renderLibraryView = () => (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-3xl font-bold mb-2">Questionnaire Library</h2>
            <p className="text-gray-500">Search and reference completed security assessments</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => setShowStorageInfo(true)}
              className="bg-[#111418] border border-gray-900/50 hover:border-cyan-500/30 px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
            >
              <Database className="w-4 h-4" />
              Storage Info
            </button>
            <button 
              onClick={() => setCurrentView('import')}
              className="bg-cyan-500 hover:bg-cyan-600 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Import Questionnaires
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-4 h-4 text-cyan-400" />
              <span className="text-xs text-gray-500">TOTAL LIBRARY</span>
            </div>
            <div className="text-2xl font-bold">{stats.totalQuestionnaires}</div>
            <div className="text-xs text-gray-500 mt-1">questionnaires</div>
          </div>
          <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-gray-500">QUESTIONS</span>
            </div>
            <div className="text-2xl font-bold">{stats.totalQuestions.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">answered</div>
          </div>
          <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-green-400" />
              <span className="text-xs text-gray-500">AVG CONFIDENCE</span>
            </div>
            <div className="text-2xl font-bold text-green-400">{stats.avgConfidence}%</div>
            <div className="text-xs text-gray-500 mt-1">auto-fill rate</div>
          </div>
          <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-yellow-400" />
              <span className="text-xs text-gray-500">THIS MONTH</span>
            </div>
            <div className="text-2xl font-bold text-yellow-400">{stats.thisMonth}</div>
            <div className="text-xs text-gray-500 mt-1">added</div>
          </div>
          <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-gray-500">RECENT</span>
            </div>
            <div className="text-2xl font-bold text-blue-400">{stats.recentlyAdded}</div>
            <div className="text-xs text-gray-500 mt-1">last 30 days</div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="mb-6">
        <div className="flex gap-4 mb-4">
          {/* Search Bar */}
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by vendor, industry, or tags..."
              className="w-full bg-[#111418] border border-gray-900/50 rounded-lg pl-12 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>

          {/* View Toggle */}
          <div className="flex gap-2 bg-[#111418] border border-gray-900/50 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${viewMode === 'grid' ? 'bg-cyan-500 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <Grid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${viewMode === 'list' ? 'bg-cyan-500 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <List className="w-5 h-5" />
            </button>
          </div>

          {/* Filter Button */}
          <button className="bg-[#111418] border border-gray-900/50 hover:border-cyan-500/30 px-4 py-3 rounded-lg flex items-center gap-2 transition-colors">
            <Filter className="w-5 h-5" />
            <span>Filters</span>
          </button>
        </div>

        {/* Tag Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500">Filter by tag:</span>
          {allTags.slice(0, 6).map(tag => (
            <button
              key={tag}
              onClick={() => {
                setSelectedTags(prev => 
                  prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                );
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedTags.includes(tag)
                  ? 'bg-cyan-500 text-white'
                  : 'bg-[#111418] border border-gray-900/50 text-gray-400 hover:border-cyan-500/30'
              }`}
            >
              {tag}
            </button>
          ))}
          {selectedTags.length > 0 && (
            <button
              onClick={() => setSelectedTags([])}
              className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Results Count */}
      <div className="mb-4 text-sm text-gray-500">
        Showing {filteredQuestionnaires.length} of {questionnaires.length} questionnaires
      </div>

      {/* Questionnaire Grid/List */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredQuestionnaires.map(q => (
            <button
              key={q.id}
              onClick={() => handleQuestionnaireClick(q)}
              className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 hover:border-cyan-500/30 transition-all text-left group"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold mb-1 truncate group-hover:text-cyan-400 transition-colors">
                    {q.vendor}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Building className="w-3 h-3" />
                    <span>{q.industry}</span>
                  </div>
                </div>
                <div className={`px-2 py-1 rounded-full text-xs flex-shrink-0 ${
                  q.status === 'approved' ? 'bg-green-500/10 text-green-400' :
                  q.status === 'conditional' ? 'bg-yellow-500/10 text-yellow-400' :
                  'bg-gray-500/10 text-gray-400'
                }`}>
                  {q.status}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 mb-4 pb-4 border-b border-gray-900/30">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Questions</div>
                  <div className="font-semibold">{q.questions}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Confidence</div>
                  <div className="font-semibold text-green-400">{q.confidence}%</div>
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mb-4">
                {q.tags.slice(0, 3).map(tag => (
                  <span key={tag} className="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 text-xs rounded-full">
                    {tag}
                  </span>
                ))}
                {q.tags.length > 3 && (
                  <span className="px-2 py-0.5 bg-gray-900 text-gray-500 text-xs rounded-full">
                    +{q.tags.length - 3}
                  </span>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {q.completedDate}
                </span>
                <span className="flex items-center gap-1 text-cyan-400 group-hover:gap-2 transition-all">
                  View
                  <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredQuestionnaires.map(q => (
            <button
              key={q.id}
              onClick={() => handleQuestionnaireClick(q)}
              className="w-full bg-[#111418] border border-gray-900/50 rounded-lg p-4 hover:border-cyan-500/30 transition-all text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold group-hover:text-cyan-400 transition-colors">
                      {q.vendor}
                    </h3>
                    <span className="px-2 py-0.5 bg-gray-900 text-gray-400 text-xs rounded-full">
                      {q.industry}
                    </span>
                    <div className="flex gap-2">
                      {q.tags.slice(0, 2).map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 text-xs rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm text-gray-500">
                    <span>{q.questions} questions</span>
                    <span>{q.confidence}% confidence</span>
                    <span>Completed {q.completedDate}</span>
                    <span>{q.documentsAttached.length} docs attached</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-cyan-400 transition-colors" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const renderImportView = () => (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">Import Questionnaires</h2>
        <p className="text-gray-500">Add completed questionnaires to your knowledge base</p>
      </div>

      {!importMethod ? (
        <>
          {/* Import Method Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <button
              onClick={() => setImportMethod('local')}
              className="bg-[#111418] border border-gray-900/50 rounded-lg p-8 hover:border-cyan-500/30 transition-all text-center group"
            >
              <div className="bg-cyan-500/10 w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:bg-cyan-500/20 transition-colors">
                <Upload className="w-8 h-8 text-cyan-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Local Upload</h3>
              <p className="text-sm text-gray-500 mb-4">
                Upload individual files from your computer
              </p>
              <div className="text-xs text-gray-600">
                Supports: PDF, DOCX, XLSX, CSV
              </div>
            </button>

            <button
              onClick={() => setImportMethod('drive')}
              className="bg-[#111418] border border-gray-900/50 rounded-lg p-8 hover:border-cyan-500/30 transition-all text-center group"
            >
              <div className="bg-cyan-500/10 w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:bg-cyan-500/20 transition-colors">
                <FolderOpen className="w-8 h-8 text-cyan-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Google Drive Folder</h3>
              <p className="text-sm text-gray-500 mb-4">
                Import an entire folder from Google Drive
              </p>
              <div className="text-xs text-gray-600">
                Automatically syncs new files
              </div>
            </button>

            <button
              onClick={() => setImportMethod('bulk')}
              className="bg-[#111418] border border-gray-900/50 rounded-lg p-8 hover:border-cyan-500/30 transition-all text-center group"
            >
              <div className="bg-cyan-500/10 w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:bg-cyan-500/20 transition-colors">
                <Database className="w-8 h-8 text-cyan-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Bulk Import</h3>
              <p className="text-sm text-gray-500 mb-4">
                Upload multiple files at once via ZIP
              </p>
              <div className="text-xs text-gray-600">
                Process up to 100 files
              </div>
            </button>
          </div>

          {/* Info Box */}
          <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-6">
            <h4 className="font-semibold text-cyan-400 mb-3">Import Guidelines</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                <span>Questionnaires are automatically parsed and indexed for search</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                <span>Metadata (vendor name, date, industry) is extracted when available</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                <span>Questions and answers are stored for future reference and reuse</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                <span>Duplicate detection prevents importing the same questionnaire twice</span>
              </li>
            </ul>
          </div>
        </>
      ) : importMethod === 'local' ? (
        <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-12">
          <div className="text-center">
            <div className="bg-cyan-500/10 w-20 h-20 rounded-lg flex items-center justify-center mx-auto mb-6">
              <Upload className="w-10 h-10 text-cyan-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Upload Questionnaires</h3>
            <p className="text-gray-500 mb-6">
              Drag and drop files here, or click to browse
            </p>
            
            <div className="border-2 border-dashed border-gray-700 rounded-lg p-12 mb-6 hover:border-cyan-500/50 transition-colors cursor-pointer">
              <input type="file" multiple accept=".pdf,.docx,.xlsx,.csv" className="hidden" id="file-upload" />
              <label htmlFor="file-upload" className="cursor-pointer">
                <div className="text-gray-400">
                  <p className="mb-2">Drop files here or click to select</p>
                  <p className="text-sm text-gray-600">Supports: PDF, DOCX, XLSX, CSV (max 25MB each)</p>
                </div>
              </label>
            </div>

            <div className="flex justify-center gap-3">
              <button
                onClick={() => setImportMethod(null)}
                className="bg-[#0B0F13] border border-gray-900/50 hover:border-gray-700 px-6 py-3 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImportComplete}
                className="bg-cyan-500 hover:bg-cyan-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Start Import
              </button>
            </div>
          </div>
        </div>
      ) : importMethod === 'drive' ? (
        <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-8">
          <h3 className="text-xl font-semibold mb-6">Connect Google Drive Folder</h3>
          
          <div className="space-y-6 mb-8">
            <div>
              <label className="block text-sm font-medium mb-2">Google Drive Folder URL</label>
              <input
                type="text"
                placeholder="https://drive.google.com/drive/folders/..."
                className="w-full bg-[#0B0F13] border border-gray-900/50 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20"
              />
              <p className="text-xs text-gray-500 mt-2">
                Paste the URL of the Google Drive folder containing your questionnaires
              </p>
            </div>

            <div className="bg-[#0B0F13] border border-gray-900/50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <FolderOpen className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium mb-2">Folder Access Required</h4>
                  <p className="text-sm text-gray-400 mb-3">
                    Serotonin needs permission to access this folder. You'll be redirected to Google to grant access.
                  </p>
                  <button className="bg-white hover:bg-gray-100 text-gray-900 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Connect Google Drive
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="rounded bg-[#0B0F13] border-gray-700 text-cyan-500 focus:ring-cyan-500/20" />
                <span className="text-sm">Auto-sync new files added to this folder</span>
              </label>
            </div>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setImportMethod(null)}
              className="text-gray-500 hover:text-gray-300 text-sm flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Import Options
            </button>
            <button
              onClick={handleImportComplete}
              className="bg-cyan-500 hover:bg-cyan-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Import Folder
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-12">
          <div className="text-center">
            <div className="bg-cyan-500/10 w-20 h-20 rounded-lg flex items-center justify-center mx-auto mb-6">
              <Database className="w-10 h-10 text-cyan-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Bulk Import</h3>
            <p className="text-gray-500 mb-6">
              Upload a ZIP file containing multiple questionnaires
            </p>
            
            <div className="border-2 border-dashed border-gray-700 rounded-lg p-12 mb-6 hover:border-cyan-500/50 transition-colors cursor-pointer">
              <input type="file" accept=".zip" className="hidden" id="zip-upload" />
              <label htmlFor="zip-upload" className="cursor-pointer">
                <div className="text-gray-400">
                  <p className="mb-2">Drop ZIP file here or click to select</p>
                  <p className="text-sm text-gray-600">Max 500MB • Up to 100 files</p>
                </div>
              </label>
            </div>

            <div className="flex justify-center gap-3">
              <button
                onClick={() => setImportMethod(null)}
                className="bg-[#0B0F13] border border-gray-900/50 hover:border-gray-700 px-6 py-3 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImportComplete}
                className="bg-cyan-500 hover:bg-cyan-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Process ZIP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderDetailView = () => {
    if (!selectedQuestionnaire) return null;

    return (
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-3xl font-bold mb-2">{selectedQuestionnaire.vendor}</h2>
              <div className="flex items-center gap-4 text-gray-500">
                <span className="flex items-center gap-1">
                  <Building className="w-4 h-4" />
                  {selectedQuestionnaire.industry}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Completed {selectedQuestionnaire.completedDate}
                </span>
                <span className="flex items-center gap-1">
                  <FileText className="w-4 h-4" />
                  {selectedQuestionnaire.source}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="bg-[#111418] border border-gray-900/50 hover:border-cyan-500/30 p-2 rounded-lg transition-colors">
                <Download className="w-5 h-5" />
              </button>
              <button className="bg-[#111418] border border-gray-900/50 hover:border-cyan-500/30 p-2 rounded-lg transition-colors">
                <Copy className="w-5 h-5" />
              </button>
              <button className="bg-[#111418] border border-gray-900/50 hover:border-cyan-500/30 p-2 rounded-lg transition-colors">
                <ExternalLink className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-4">
            <div className="text-sm text-gray-500 mb-1">Questions</div>
            <div className="text-2xl font-bold">{selectedQuestionnaire.questions}</div>
          </div>
          <div className="bg-[#111418] border border-green-500/20 rounded-lg p-4">
            <div className="text-sm text-gray-500 mb-1">Auto-filled</div>
            <div className="text-2xl font-bold text-green-400">{selectedQuestionnaire.autoFilled}</div>
          </div>
          <div className="bg-[#111418] border border-yellow-500/20 rounded-lg p-4">
            <div className="text-sm text-gray-500 mb-1">Flagged</div>
            <div className="text-2xl font-bold text-yellow-400">{selectedQuestionnaire.flagged}</div>
          </div>
          <div className="bg-[#111418] border border-cyan-500/20 rounded-lg p-4">
            <div className="text-sm text-gray-500 mb-1">Confidence</div>
            <div className="text-2xl font-bold text-cyan-400">{selectedQuestionnaire.confidence}%</div>
          </div>
        </div>

        {/* Tags */}
        <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 mb-6">
          <h3 className="font-semibold mb-4">Tags & Categories</h3>
          <div className="flex flex-wrap gap-2">
            {selectedQuestionnaire.tags.map(tag => (
              <span key={tag} className="px-3 py-1.5 bg-cyan-500/10 text-cyan-400 text-sm rounded-full">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Attached Documents */}
        <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 mb-6">
          <h3 className="font-semibold mb-4">Attached Documents</h3>
          <div className="space-y-3">
            {selectedQuestionnaire.documentsAttached.map((doc, idx) => (
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

        {/* Actions */}
        <div className="flex gap-3">
          <button className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-white px-6 py-3 rounded-lg font-medium transition-colors">
            Use as Template
          </button>
          <button className="bg-[#111418] border border-gray-900/50 hover:border-cyan-500/30 px-6 py-3 rounded-lg transition-colors">
            Export PDF
          </button>
          <button 
            onClick={handleDeleteRequest}
            className="bg-[#111418] border border-gray-900/50 hover:border-red-500/30 text-gray-400 hover:text-red-400 px-6 py-3 rounded-lg transition-colors flex items-center gap-2"
          >
            <Trash2 className="w-5 h-5" />
            Request Delete
          </button>
        </div>
      </div>
    );
  };

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
                  onClick={() => {
                    if (currentView === 'library') {
                      window.history.back();
                    } else {
                      setCurrentView('library');
                      setSelectedQuestionnaire(null);
                    }
                  }}
                  className="text-gray-500 hover:text-gray-300"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h1 className="text-xl font-semibold">Knowledge Base</h1>
                  <p className="text-sm text-gray-500">Search and reference completed questionnaires</p>
                </div>
              </div>
              
              {currentView === 'library' && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">
                    {stats.totalQuestionnaires} questionnaires • {stats.totalQuestions.toLocaleString()} questions
                  </span>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-6 py-12">
          {currentView === 'library' && renderLibraryView()}
          {currentView === 'import' && renderImportView()}
          {currentView === 'detail' && renderDetailView()}
        </main>

        {/* Modals */}
        {renderDeleteModal()}
        {renderStorageInfoModal()}

        {/* Footer */}
        <div className="mt-auto py-6 text-center text-xs text-gray-700 border-t border-gray-900/50">
          Created and Owned by Blayqe Forbes • Copyright © 2025 All Rights Reserved
        </div>
      </div>
    </div>
  );
}
