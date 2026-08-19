import React, { useState } from 'react';
import { 
  ArrowLeft, Upload, Mail, FolderOpen, Search, AlertTriangle,
  CheckCircle, XCircle, Shield, TrendingUp, TrendingDown,
  FileText, Download, ExternalLink, Filter, ChevronRight,
  Calendar, Building, Globe, Lock, Database, Users, Activity
} from 'lucide-react';

// Serotonin Vendor Dashboard
// Created and Owned by Blayqe Forbes
// Copyright © 2025 Blayqe Forbes. All Rights Reserved.

export default function VendorDashboard() {
  const [currentView, setCurrentView] = useState('intake'); // intake, analyzing, results, detail
  const [selectedVendor, setSelectedVendor] = useState(null);
  
  // Sample vendor data
  const [vendors] = useState([
    {
      id: 1,
      name: 'CloudSync Solutions',
      industry: 'SaaS / Cloud Storage',
      submittedDate: '2024-05-12',
      riskScore: 72,
      riskLevel: 'MEDIUM',
      status: 'pending-review',
      concerns: 5,
      strengths: 12
    },
    {
      id: 2,
      name: 'DataGuard Analytics',
      industry: 'Data Analytics',
      submittedDate: '2024-05-10',
      riskScore: 45,
      riskLevel: 'HIGH',
      status: 'reviewed',
      concerns: 8,
      strengths: 7
    },
    {
      id: 3,
      name: 'SecureComm Systems',
      industry: 'Communications',
      submittedDate: '2024-05-08',
      riskScore: 89,
      riskLevel: 'LOW',
      status: 'approved',
      concerns: 2,
      strengths: 18
    }
  ]);

  const [analysisResults, setAnalysisResults] = useState({
    vendorName: 'CloudSync Solutions',
    industry: 'SaaS / Cloud Storage',
    overallRisk: 72,
    riskLevel: 'MEDIUM',
    recommendation: 'CONDITIONAL_APPROVAL',
    criticalConcerns: [
      {
        category: 'Compliance',
        issue: 'No SOC 2 Type II certification',
        severity: 'critical',
        detail: 'Last audit completed in 2022. No current certification on file.',
        remediation: 'Require updated SOC 2 Type II within 90 days'
      },
      {
        category: 'Data Retention',
        issue: 'Data retention exceeds policy limits',
        severity: 'critical',
        detail: 'Vendor retains data for 7 years; our policy allows maximum 3 years.',
        remediation: 'Negotiate 3-year retention in contract'
      }
    ],
    mediumConcerns: [
      {
        category: 'Authentication',
        issue: 'MFA not enforced for all users',
        severity: 'medium',
        detail: 'Multi-factor authentication is optional, not mandatory.',
        remediation: 'Implement mandatory MFA within 60 days'
      },
      {
        category: 'Testing',
        issue: 'Annual penetration testing frequency',
        severity: 'medium',
        detail: 'Pen testing conducted annually. Industry best practice is quarterly.',
        remediation: 'Recommend increasing to quarterly testing'
      },
      {
        category: 'Security Team',
        issue: 'No dedicated security team',
        severity: 'medium',
        detail: 'Security operations outsourced to third-party MSP.',
        remediation: 'Request MSP credentials and audit rights'
      }
    ],
    strengths: [
      {
        category: 'Compliance',
        strength: 'HIPAA compliant with current BAA',
        detail: 'Business Associate Agreement in place and up to date.'
      },
      {
        category: 'Encryption',
        strength: 'Strong encryption standards',
        detail: 'AES-256 for data at rest, TLS 1.3 for data in transit.'
      },
      {
        category: 'Training',
        strength: 'Annual security awareness training',
        detail: 'All employees complete mandatory security training annually.'
      },
      {
        category: 'Incident Response',
        strength: 'Documented incident response plan',
        detail: 'Comprehensive IR plan with defined roles and escalation procedures.'
      }
    ],
    complianceGaps: [
      { framework: 'SOC 2', status: 'outdated', detail: 'Last audit: 2022' },
      { framework: 'ISO 27001', status: 'missing', detail: 'No certification' },
      { framework: 'HIPAA', status: 'compliant', detail: 'Current BAA in place' },
      { framework: 'GDPR', status: 'partial', detail: 'Data residency concerns' }
    ],
    timeline: {
      received: '2024-05-12',
      analyzed: '2024-05-13',
      deadline: '2024-05-20'
    }
  });

  const handleSourceSelect = (source) => {
    setCurrentView('analyzing');
    setTimeout(() => {
      setCurrentView('results');
    }, 3000);
  };

  const handleVendorSelect = (vendor) => {
    setSelectedVendor(vendor);
    setCurrentView('detail');
  };

  const getRiskColor = (level) => {
    switch(level) {
      case 'LOW': return 'text-green-400 bg-green-500/10 border-green-500/30';
      case 'MEDIUM': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
      case 'HIGH': return 'text-red-400 bg-red-500/10 border-red-500/30';
      default: return 'text-gray-400 bg-gray-500/10 border-gray-500/30';
    }
  };

  const renderIntakeView = () => (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">Evaluate Vendor Response</h2>
        <p className="text-gray-500">Assess a vendor's security questionnaire submission</p>
      </div>

      {/* Pending Reviews */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Pending Reviews</h3>
          <span className="text-sm text-gray-500">3 vendors awaiting evaluation</span>
        </div>
        <div className="space-y-3">
          {vendors.filter(v => v.status === 'pending-review').map(vendor => (
            <button
              key={vendor.id}
              onClick={() => handleVendorSelect(vendor)}
              className="w-full bg-[#111418] border border-gray-900/50 rounded-lg p-4 hover:border-cyan-500/30 transition-all text-left group"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Building className="w-5 h-5 text-cyan-400" />
                    <h4 className="font-semibold">{vendor.name}</h4>
                    <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-400 text-xs rounded-full">
                      Pending Review
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      {vendor.industry}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Submitted {vendor.submittedDate}
                    </span>
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {vendor.concerns} concerns identified
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-cyan-400 transition-colors" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* New Evaluation */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">Start New Evaluation</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => handleSourceSelect('gmail')}
            className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 hover:border-cyan-500/30 transition-all text-left group"
          >
            <div className="bg-cyan-500/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:bg-cyan-500/20 transition-colors">
              <Mail className="w-6 h-6 text-cyan-400" />
            </div>
            <h4 className="font-semibold mb-1">Gmail</h4>
            <p className="text-sm text-gray-500">Find questionnaire in inbox</p>
          </button>

          <button
            onClick={() => handleSourceSelect('drive')}
            className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 hover:border-cyan-500/30 transition-all text-left group"
          >
            <div className="bg-cyan-500/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:bg-cyan-500/20 transition-colors">
              <FolderOpen className="w-6 h-6 text-cyan-400" />
            </div>
            <h4 className="font-semibold mb-1">Google Drive</h4>
            <p className="text-sm text-gray-500">Select from Drive</p>
          </button>

          <button
            onClick={() => handleSourceSelect('upload')}
            className="bg-[#111418] border border-gray-900/50 rounded-lg p-6 hover:border-cyan-500/30 transition-all text-left group"
          >
            <div className="bg-cyan-500/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:bg-cyan-500/20 transition-colors">
              <Upload className="w-6 h-6 text-cyan-400" />
            </div>
            <h4 className="font-semibold mb-1">Upload File</h4>
            <p className="text-sm text-gray-500">Upload questionnaire</p>
          </button>
        </div>
      </div>

      {/* Recently Reviewed */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Recently Reviewed</h3>
        <div className="space-y-3">
          {vendors.filter(v => v.status !== 'pending-review').map(vendor => (
            <button
              key={vendor.id}
              onClick={() => handleVendorSelect(vendor)}
              className="w-full bg-[#111418] border border-gray-900/50 rounded-lg p-4 hover:border-cyan-500/30 transition-all text-left group"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Building className="w-5 h-5 text-gray-500" />
                    <h4 className="font-medium">{vendor.name}</h4>
                    <span className={`px-2 py-0.5 text-xs rounded-full border ${getRiskColor(vendor.riskLevel)}`}>
                      {vendor.riskLevel} RISK
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>{vendor.industry}</span>
                    <span>Score: {vendor.riskScore}/100</span>
                    <span>Reviewed {vendor.submittedDate}</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-cyan-400 transition-colors" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderAnalyzingView = () => (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-cyan-500/10 rounded-full mb-4">
          <Shield className="w-8 h-8 text-cyan-400 animate-pulse" />
        </div>
        <h2 className="text-3xl font-bold mb-2">Analyzing Vendor Response</h2>
        <p className="text-gray-500">Serotonin is evaluating security posture and identifying risks...</p>
      </div>

      {/* Analysis Progress */}
      <div className="bg-[#111418] border border-gray-900/50 rounded-lg p-8 mb-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span className="text-sm">Questionnaire parsed - 52 responses identified</span>
          </div>
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-cyan-400 animate-pulse" />
            <span className="text-sm">Analyzing compliance certifications...</span>
          </div>
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-cyan-400 animate-pulse" />
            <span className="text-sm">Evaluating security controls and practices...</span>
          </div>
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-cyan-400 animate-pulse" />
            <span className="text-sm">Comparing against organizational requirements...</span>
          </div>
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-cyan-400 animate-pulse" />
            <span className="text-sm">Generating risk assessment report...</span>
          </div>
        </div>
      </div>

      <div className="text-center text-sm text-gray-500">
        This typically takes 30-60 seconds
      </div>
    </div>
  );

  const renderResultsView = () => (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-3xl font-bold mb-2">{analysisResults.vendorName}</h2>
            <p className="text-gray-500">{analysisResults.industry}</p>
          </div>
          <div className="flex gap-3">
            <button className="bg-[#111418] border border-gray-900/50 hover:border-cyan-500/30 px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors">
              <Download className="w-4 h-4" />
              Export Report
            </button>
          </div>
        </div>

        {/* Risk Score Card */}
        <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-yellow-400 mb-1">OVERALL RISK ASSESSMENT</div>
              <div className="flex items-center gap-4">
                <div className="text-5xl font-bold text-yellow-400">{analysisResults.overallRisk}</div>
                <div>
                  <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getRiskColor(analysisResults.riskLevel)}`}>
                    {analysisResults.riskLevel} RISK
                  </div>
                  <div className="text-sm text-gray-400 mt-1">Score out of 100</div>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500 mb-2">RECOMMENDATION</div>
              <div className="px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="font-semibold text-yellow-400">CONDITIONAL APPROVAL</div>
                <div className="text-xs text-gray-400 mt-1">2 critical items must be addressed</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-[#111418] border border-red-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-4 h-4 text-red-400" />
            <span className="text-xs text-gray-500">CRITICAL CONCERNS</span>
          </div>
          <div className="text-2xl font-bold text-red-400">{analysisResults.criticalConcerns.length}</div>
        </div>
        <div className="bg-[#111418] border border-yellow-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            <span className="text-xs text-gray-500">MEDIUM CONCERNS</span>
          </div>
          <div className="text-2xl font-bold text-yellow-400">{analysisResults.mediumConcerns.length}</div>
        </div>
        <div className="bg-[#111418] border border-green-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-xs text-gray-500">STRENGTHS</span>
          </div>
          <div className="text-2xl font-bold text-green-400">{analysisResults.strengths.length}</div>
        </div>
        <div className="bg-[#111418] border border-cyan-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-gray-500">COMPLETION</span>
          </div>
          <div className="text-2xl font-bold text-cyan-400">100%</div>
        </div>
      </div>

      {/* Critical Concerns */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <XCircle className="w-5 h-5 text-red-400" />
          <h3 className="text-xl font-bold">Critical Concerns</h3>
          <span className="px-2 py-0.5 bg-red-500/10 text-red-400 text-xs rounded-full">
            Must Address
          </span>
        </div>
        <div className="space-y-4">
          {analysisResults.criticalConcerns.map((concern, idx) => (
            <div key={idx} className="bg-[#111418] border border-red-500/20 rounded-lg p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 bg-red-500/10 text-red-400 text-xs rounded-full font-medium">
                      {concern.category}
                    </span>
                  </div>
                  <h4 className="font-semibold text-lg">{concern.issue}</h4>
                </div>
              </div>
              <p className="text-gray-400 text-sm mb-4">{concern.detail}</p>
              <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                <div className="text-xs text-red-400 font-medium mb-1">REQUIRED REMEDIATION:</div>
                <div className="text-sm text-gray-300">{concern.remediation}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Medium Concerns */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-yellow-400" />
          <h3 className="text-xl font-bold">Medium Concerns</h3>
          <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-400 text-xs rounded-full">
            Recommended
          </span>
        </div>
        <div className="space-y-4">
          {analysisResults.mediumConcerns.map((concern, idx) => (
            <div key={idx} className="bg-[#111418] border border-yellow-500/20 rounded-lg p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-400 text-xs rounded-full font-medium">
                      {concern.category}
                    </span>
                  </div>
                  <h4 className="font-semibold">{concern.issue}</h4>
                </div>
              </div>
              <p className="text-gray-400 text-sm mb-4">{concern.detail}</p>
              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
                <div className="text-xs text-yellow-400 font-medium mb-1">RECOMMENDATION:</div>
                <div className="text-sm text-gray-300">{concern.remediation}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Strengths */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="w-5 h-5 text-green-400" />
          <h3 className="text-xl font-bold">Strengths & Positive Indicators</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {analysisResults.strengths.map((strength, idx) => (
            <div key={idx} className="bg-[#111418] border border-green-500/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="bg-green-500/10 w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <div className="font-semibold mb-1">{strength.strength}</div>
                  <div className="text-sm text-gray-400">{strength.detail}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Compliance Framework Status */}
      <div className="mb-8">
        <h3 className="text-xl font-bold mb-4">Compliance Framework Status</h3>
        <div className="bg-[#111418] border border-gray-900/50 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-[#0B0F13] border-b border-gray-900/50">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-400">Framework</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-400">Status</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-400">Details</th>
              </tr>
            </thead>
            <tbody>
              {analysisResults.complianceGaps.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-900/30 last:border-0">
                  <td className="px-6 py-4 font-medium">{item.framework}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      item.status === 'compliant' ? 'bg-green-500/10 text-green-400' :
                      item.status === 'partial' ? 'bg-yellow-500/10 text-yellow-400' :
                      'bg-red-500/10 text-red-400'
                    }`}>
                      {item.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">{item.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Final Recommendation */}
      <div className="bg-gradient-to-br from-cyan-500/10 to-purple-500/10 border border-cyan-500/30 rounded-lg p-6">
        <h3 className="text-xl font-bold mb-4">Final Recommendation</h3>
        <div className="space-y-3 text-sm">
          <p className="text-gray-300">
            <strong className="text-cyan-400">Decision:</strong> Conditional Approval - Vendor may proceed pending resolution of critical items.
          </p>
          <p className="text-gray-300">
            <strong className="text-cyan-400">Required Actions:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-400 ml-4">
            <li>Obtain updated SOC 2 Type II certification within 90 days</li>
            <li>Negotiate 3-year data retention limit in contract</li>
          </ul>
          <p className="text-gray-300 mt-4">
            <strong className="text-cyan-400">Recommended Actions:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-400 ml-4">
            <li>Implement mandatory MFA for all users within 60 days</li>
            <li>Increase penetration testing frequency to quarterly</li>
            <li>Request third-party MSP credentials and audit rights</li>
          </ul>
        </div>
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
                  onClick={() => currentView === 'intake' ? window.history.back() : setCurrentView('intake')}
                  className="text-gray-500 hover:text-gray-300"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h1 className="text-xl font-semibold">Vendor Risk Assessment</h1>
                  <p className="text-sm text-gray-500">Evaluate vendor security posture and compliance</p>
                </div>
              </div>
              
              {currentView === 'results' && (
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1.5 rounded-full text-xs font-medium border ${getRiskColor(analysisResults.riskLevel)}`}>
                    {analysisResults.riskLevel} RISK • Score: {analysisResults.overallRisk}/100
                  </span>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-6 py-12">
          {currentView === 'intake' && renderIntakeView()}
          {currentView === 'analyzing' && renderAnalyzingView()}
          {currentView === 'results' && renderResultsView()}
        </main>

        {/* Footer */}
        <div className="mt-auto py-6 text-center text-xs text-gray-700 border-t border-gray-900/50">
          Created and Owned by Blayqe Forbes • Copyright © 2025 All Rights Reserved
        </div>
      </div>
    </div>
  );
}
