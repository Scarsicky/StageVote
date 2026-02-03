import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './styles.css'
import Audience from './routes/Audience'
import Admin from './routes/Admin'
import Display from './routes/Display'
import Conductor from './routes/Conductor'

const router = createBrowserRouter([
{ path: '/', element: <Audience /> },
{ path: '/regie', element: <Admin /> },
{ path: '/beamer', element: <Display />},
{ path: '/almer', element: <Conductor />}
])


ReactDOM.createRoot(document.getElementById('root')!).render(
<React.StrictMode>
<div className="container">
<RouterProvider router={router} />
</div>
</React.StrictMode>
)