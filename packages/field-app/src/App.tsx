// Field PWA — Wave A office/Sale console (ADR-040)
// state-router เบา ๆ (ยังไม่ลาก react-router — จอน้อย เพิ่มทีหลังได้)
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { Login } from './screens/Login';
import { Projects } from './screens/Projects';
import { NewProject } from './screens/NewProject';
import { ProjectDetail } from './screens/ProjectDetail';
import { RequirementForm } from './screens/RequirementForm';

export type Route =
  | { name: 'projects' }
  | { name: 'new-project' }
  | { name: 'project'; id: string }
  | { name: 'requirement' };

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [route, setRoute] = useState<Route>({ name: 'projects' });

  useEffect(() => {
    let sb;
    try { sb = supabase(); } catch { setAuthed(false); return; }
    sb.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setAuthed(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (authed === null) return <div className="page muted">กำลังเปิดระบบ…</div>;
  if (!authed) return <Login />;

  return (
    <>
      <header className="app-header">
        <span>DAPH หน้างาน</span>
        <button className="btn-ghost" style={{ width: 'auto', minHeight: 36, padding: '4px 12px', color: '#fff', borderColor: '#ffffff88' }}
          onClick={() => supabase().auth.signOut()}>ออก</button>
      </header>
      {route.name === 'projects' && <Projects onNew={() => setRoute({ name: 'new-project' })} onOpen={(id) => setRoute({ name: 'project', id })} onRequirement={() => setRoute({ name: 'requirement' })} />}
      {route.name === 'requirement' && <RequirementForm onDone={() => setRoute({ name: 'projects' })} />}
      {route.name === 'new-project' && <NewProject onDone={() => setRoute({ name: 'projects' })} />}
      {route.name === 'project' && <ProjectDetail id={route.id} onBack={() => setRoute({ name: 'projects' })} />}
    </>
  );
}
