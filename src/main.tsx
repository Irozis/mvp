import './registerPresets'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { registerAiImageAnalyzer } from './lib/imageAnalysis'
import { groqImageAnalyzer } from './lib/groqImageAnalyzer'

registerAiImageAnalyzer(groqImageAnalyzer)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
