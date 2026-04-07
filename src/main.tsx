import './registerPresets'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { registerAiImageAnalyzer } from './lib/imageAnalysis'
import { anthropicImageAnalyzer } from './lib/anthropicImageAnalyzer'

registerAiImageAnalyzer(anthropicImageAnalyzer)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
