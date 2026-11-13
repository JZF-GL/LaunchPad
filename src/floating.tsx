import React from 'react'
import ReactDOM from 'react-dom/client'
import { FloatingDock } from './components/FloatingDock'
import { FloatingIcon } from './components/FloatingIcon'
import './index.css'

/** 同一个入口页承载两种窗口：?mode=icon 渲染悬浮图标，?mode=panel 渲染展开面板 */
const mode = new URLSearchParams(window.location.search).get('mode')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{mode === 'panel' ? <FloatingDock /> : <FloatingIcon />}</React.StrictMode>
)
