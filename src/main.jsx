import React from 'react'
import ReactDOM from 'react-dom/client'
import Serotonin from './Serotonin.jsx'

// Public demo — loads directly, no authentication required.
// To enable auth for your own deployment, connect a Supabase
// instance and follow the setup guide in README.md.

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Serotonin />
  </React.StrictMode>
)
