'use client';
import { useEffect } from 'react';

export default function Page() {
  useEffect(() => {
    // Aizstāt google.script.run ar fetch uz mūsu API
    window.gsr = {
      withSuccessHandler: (fn) => ({
        withFailureHandler: (fe) => ({
          sGetAll:      () => fetch('/api/bookings').then(r=>r.json()).then(d=>fn(JSON.stringify(d.bookings))).catch(fe),
          sSave:        (data) => fetch('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}).then(r=>r.json()).then(d=>fn(JSON.stringify(d))).catch(fe),
          sUpdate:      (id,data) => fetch('/api/bookings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,...data})}).then(r=>r.json()).then(d=>fn(JSON.stringify(d))).catch(fe),
          sDelete:      (id) => fetch('/api/bookings',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}).then(r=>r.json()).then(d=>fn(JSON.stringify(d))).catch(fe),
          sSetStatus:   (id,s) => fetch('/api/bookings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,status:s})}).then(r=>r.json()).then(d=>fn(JSON.stringify(d))).catch(fe),
        })
      })
    };
    window.google = { script: { run: window.gsr } };
  }, []);

  return (
    <div id="app-root" dangerouslySetInnerHTML={{ __html: '' }} />
  );
}
