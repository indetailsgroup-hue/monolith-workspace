// Field PWA — Wave A office/Sale console (ADR-040)
// state-router เบา ๆ (ยังไม่ลาก react-router — จอน้อย เพิ่มทีหลังได้)
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { Login } from './screens/Login';
import { Projects } from './screens/Projects';
import { NewProject } from './screens/NewProject';
import { ProjectDetail } from './screens/ProjectDetail';
import { RequirementForm } from './screens/RequirementForm';
import { MyWork } from './screens/MyWork';
import { SaleHome } from './screens/SaleHome';
import { LeaderHome } from './screens/LeaderHome';
import { DesignerHome } from './screens/DesignerHome';
import { SalesSummary } from './screens/SalesSummary';
import { FinanceHome } from './screens/FinanceHome';
import { FactoryHome } from './screens/FactoryHome';

export type Route =
  | { name: 'projects' }
  | { name: 'new-project' }
  | { name: 'project'; id: string }
  | { name: 'requirement' }
  | { name: 'my-work' }
  | { name: 'sale-home' }
  | { name: 'lead-home' }
  | { name: 'designer-home' }
  | { name: 'sales-summary' }
  | { name: 'finance-home' }
  | { name: 'factory-home' };

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
      <header className="app-header" style={{ flexWrap: 'wrap', rowGap: 4 }}>
        <span onClick={() => setRoute({ name: 'projects' })} style={{ cursor: 'pointer' }}>DAPH หน้างาน</span>
        <button className="btn-ghost" style={{ width: 'auto', minHeight: 36, padding: '4px 12px', color: '#fff', borderColor: '#ffffff88', marginLeft: 'auto', marginRight: 8, background: 'transparent', borderRadius: 10, border: '1.5px solid #ffffff88', fontFamily: 'inherit', cursor: 'pointer' }}
          onClick={() => setRoute({ name: 'sale-home' })}>งานขาย</button>
        <button className="btn-ghost" style={{ width: 'auto', minHeight: 36, padding: '4px 12px', color: '#fff', borderColor: '#ffffff88', marginRight: 8, background: 'transparent', borderRadius: 10, border: '1.5px solid #ffffff88', fontFamily: 'inherit', cursor: 'pointer' }}
          onClick={() => setRoute({ name: 'lead-home' })}>หัวหน้า</button>
        <button className="btn-ghost" style={{ width: 'auto', minHeight: 36, padding: '4px 12px', color: '#fff', borderColor: '#ffffff88', marginRight: 8, background: 'transparent', borderRadius: 10, border: '1.5px solid #ffffff88', fontFamily: 'inherit', cursor: 'pointer' }}
          onClick={() => setRoute({ name: 'designer-home' })}>ดีไซน์</button>
        <button className="btn-ghost" style={{ width: 'auto', minHeight: 36, padding: '4px 12px', color: '#fff', borderColor: '#ffffff88', marginRight: 8, background: 'transparent', borderRadius: 10, border: '1.5px solid #ffffff88', fontFamily: 'inherit', cursor: 'pointer' }}
          onClick={() => setRoute({ name: 'finance-home' })}>การเงิน</button>
        <button className="btn-ghost" style={{ width: 'auto', minHeight: 36, padding: '4px 12px', color: '#fff', borderColor: '#ffffff88', marginRight: 8, background: 'transparent', borderRadius: 10, border: '1.5px solid #ffffff88', fontFamily: 'inherit', cursor: 'pointer' }}
          onClick={() => setRoute({ name: 'factory-home' })}>โรงงาน</button>
        <button className="btn-ghost" style={{ width: 'auto', minHeight: 36, padding: '4px 12px', color: '#fff', borderColor: '#ffffff88', marginRight: 8, background: 'transparent', borderRadius: 10, border: '1.5px solid #ffffff88', fontFamily: 'inherit', cursor: 'pointer' }}
          onClick={() => setRoute({ name: 'my-work' })}>งานของฉัน</button>
        <button className="btn-ghost" style={{ width: 'auto', minHeight: 36, padding: '4px 12px', color: '#fff', borderColor: '#ffffff88' }}
          onClick={() => supabase().auth.signOut()}>ออก</button>
      </header>
      {route.name === 'projects' && <Projects onNew={() => setRoute({ name: 'new-project' })} onOpen={(id) => setRoute({ name: 'project', id })} onRequirement={() => setRoute({ name: 'requirement' })} />}
      {route.name === 'requirement' && <RequirementForm onDone={() => setRoute({ name: 'projects' })} />}
      {route.name === 'my-work' && <MyWork />}
      {route.name === 'sale-home' && <SaleHome onOpenProject={(id) => setRoute({ name: 'project', id })} onNewRequirement={() => setRoute({ name: 'requirement' })} onSummary={() => setRoute({ name: 'sales-summary' })} />}
      {route.name === 'sales-summary' && <SalesSummary onBack={() => setRoute({ name: 'sale-home' })} />}
      {route.name === 'finance-home' && <FinanceHome onOpenProject={(id) => setRoute({ name: 'project', id })} />}
      {route.name === 'factory-home' && <FactoryHome onOpenProject={(id) => setRoute({ name: 'project', id })} />}
      {route.name === 'lead-home' && <LeaderHome onOpenProject={(id) => setRoute({ name: 'project', id })} />}
      {route.name === 'designer-home' && <DesignerHome onOpenProject={(id) => setRoute({ name: 'project', id })} />}
      {route.name === 'new-project' && <NewProject onDone={() => setRoute({ name: 'projects' })} />}
      {route.name === 'project' && <ProjectDetail id={route.id} onBack={() => setRoute({ name: 'projects' })} />}
    </>
  );
}
