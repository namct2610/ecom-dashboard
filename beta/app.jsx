/* global React, ReactDOM, TweaksPanel, useTweaks, TweakSection, TweakSelect, TweakRadio, TweakColor */
/* global PageOverview, PageOrders, PageProducts, PageCustomers, PageTraffic, PageComparison */
/* global PagePlan, PageReconcile, PageUpload, PageLogs, PageSettings, PageAdmin, PageCustomerDetail, PageDataLinks, PageProductCatalog */
/* global PLATFORM_COLORS, PLATFORM_NAME, fmtVnd */

// ── Navigation ────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    label: 'Phân tích',
    items: [
      { id: 'overview',   label: 'Tổng quan',  icon: 'home', sub: 'Doanh thu, đơn hàng và traffic tổng hợp' },
      { id: 'plan',       label: 'Kế hoạch',   icon: 'target', sub: 'Mục tiêu năm và run-rate cần đạt', tag: 'Mới' },
      { id: 'comparison', label: 'So sánh sàn',icon: 'bars',  sub: 'Đối chiếu Shopee, Lazada, TikTok' },
    ],
  },
  {
    label: 'Bán hàng',
    items: [
      { id: 'orders',      label: 'Đơn hàng',   icon: 'cart',  sub: 'Phân tích đơn hàng theo thời gian', badge: '1.2K' },
      { id: 'products',    label: 'Sản phẩm',   icon: 'box',   sub: 'Top sản phẩm theo doanh thu và số lượng' },
    ],
  },
  {
    label: 'Khách hàng',
    items: [
      { id: 'customers', label: 'Khách hàng', icon: 'users', sub: 'Phân tích khách hàng theo địa lý' },
      { id: 'customer-detail', label: 'Chi tiết khách hàng', icon: 'list', sub: 'Doanh thu và số đơn theo từng khách' },
      { id: 'traffic',   label: 'Lượng truy cập', icon: 'eye', sub: 'PV, Visitors và tỷ lệ chuyển đổi' },
    ],
  },
  {
    label: 'Vận hành',
    items: [
      { id: 'reconcile', label: 'Đối soát GBS', icon: 'check2', sub: 'Khớp file GBS với export từ các sàn' },
      { id: 'data-links', label: 'Liên kết dữ liệu sàn', icon: 'target', sub: 'Quy tắc khớp dữ liệu sàn với GBS' },
      { id: 'product-catalog', label: 'Danh sách sản phẩm', icon: 'box', sub: 'SKU, giá GBS và quy đổi Combo' },
      { id: 'upload',    label: 'Upload dữ liệu', icon: 'upload',sub: 'Tải file Excel từ Shopee, Lazada, TikTok' },
      { id: 'logs',      label: 'Nhật ký',      icon: 'log',   sub: 'Sự kiện và lỗi hệ thống' },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      { id: 'settings', label: 'Cài đặt',  icon: 'gear', sub: 'Hồ sơ, ngôn ngữ, thông báo' },
      { id: 'admin',    label: 'Quản trị', icon: 'shield', sub: 'Tài khoản, API kết nối, hệ thống', admin: true },
    ],
  },
];

const ALL_PAGES = Object.fromEntries(NAV_GROUPS.flatMap(g => g.items).map(p => [p.id, p]));

const PAGE_COMP = {
  overview: PageOverview,
  plan: PagePlan,
  comparison: PageComparison,
  orders: PageOrders,
  products: PageProducts,
  customers: PageCustomers,
  'customer-detail': PageCustomerDetail,
  traffic: PageTraffic,
  reconcile: PageReconcile,
  'data-links': PageDataLinks,
  'product-catalog': PageProductCatalog,
  upload: PageUpload,
  logs: PageLogs,
  settings: PageSettings,
  admin: PageAdmin,
};

const NAV_ICONS = {
  home:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  cart:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6"/></svg>,
  box:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  users:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
  eye:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  bars:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  gear:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  upload: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  target: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  list:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  check2: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
  log:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  shield: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  chevron:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
};

// ── Sidebar ──────────────────────────────────────────────────────────

function Sidebar({ active, onNav, collapsed, onCollapse, userRole, user, onLogout }) {
  const [userOpen, setUserOpen] = React.useState(false);
  const uref = React.useRef(null);
  React.useEffect(() => {
    if (!userOpen) return;
    const onDoc = (e) => { if (uref.current && !uref.current.contains(e.target)) setUserOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [userOpen]);
  const initials = (user?.name || 'AD').split(' ').map(w=>w[0]).slice(-2).join('').toUpperCase();
  return (
    <aside className={'sidebar' + (collapsed ? ' collapsed' : '')}>
      <div className="brand">
        <div className="brand-logo">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12 L7 16 L11 8 L15 14 L21 6"/>
          </svg>
        </div>
        {!collapsed && (
          <div>
            <div className="brand-name">Insight</div>
            <div className="brand-meta">{(window.__BETA__?.versionLabel || 'Beta')} · TMĐT Suite</div>
          </div>
        )}
      </div>

      <div className="sidebar-scroll">
      {NAV_GROUPS.map(g => (
        <React.Fragment key={g.label}>
          {!collapsed && <div className="nav-section">{g.label}</div>}
          {g.items.map(p => {
            if (p.admin && userRole !== 'admin') return null;
            return (
              <div key={p.id} className={'nav-item' + (active === p.id ? ' active' : '')}
                   onClick={() => onNav(p.id)} title={collapsed ? p.label : ''}>
                {NAV_ICONS[p.icon]}
                {!collapsed && <span style={{flex:1}}>{p.label}</span>}
                {!collapsed && p.badge && <span className="badge">{p.badge}</span>}
                {!collapsed && p.tag && <span className="badge" style={{background:'var(--accent)', color:'#fff'}}>{p.tag}</span>}
              </div>
            );
          })}
        </React.Fragment>
      ))}
      </div>

      <div className="sidebar-bottom">
        {/* User button — góc dưới sidebar */}
        <div ref={uref} style={{position:'relative'}}>
          {userOpen && !collapsed && (
            <div className="popover sidebar-user-pop">
              <div style={{padding:6}}>
                <SidebarUserItem icon="user" label="Hồ sơ tài khoản" onClick={()=>{setUserOpen(false); onNav('settings');}}/>
                <SidebarUserItem icon="shield" label="Quản trị hệ thống" onClick={()=>{setUserOpen(false); onNav('admin');}}/>
              </div>
              <div style={{padding:6, borderTop:'1px solid var(--line-2)'}}>
                <SidebarUserItem icon="logout" label="Đăng xuất" danger onClick={onLogout}/>
              </div>
            </div>
          )}
          <div className="sidebar-userbtn" onClick={()=> collapsed ? onNav('settings') : setUserOpen(!userOpen)}
               title={collapsed ? (user?.name || 'Tài khoản') : ''}>
            <div className="user-avatar" style={{width:32, height:32, fontSize:11, flexShrink:0}}>{initials}</div>
            {!collapsed && (
              <div style={{flex:1, minWidth:0, textAlign:'left'}}>
                <div className="user-name" style={{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{user?.name || 'Admin'}</div>
                <div className="user-role">{user?.role === 'admin' ? 'Quản trị viên' : 'Nhân viên'}</div>
              </div>
            )}
            {!collapsed && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>}
          </div>
        </div>

        <div className="nav-item" onClick={onCollapse} style={{justifyContent: collapsed ? 'center' : 'flex-start', marginTop:4}}>
          <span style={{display:'inline-flex', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition:'transform 0.2s'}}>
            {NAV_ICONS.chevron}
          </span>
          {!collapsed && <span>Thu gọn</span>}
        </div>
      </div>
    </aside>
  );
}

function SidebarUserItem({ icon, label, onClick, danger }) {
  const icons = {
    user: <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
    logout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
  };
  return (
    <div onClick={onClick} style={{display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:500, color: danger ? 'var(--red)' : 'var(--ink)', transition:'background 0.15s'}}
      onMouseEnter={(e)=>e.currentTarget.style.background='var(--surface-2)'}
      onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icons[icon]}</svg>
      <span>{label}</span>
    </div>
  );
}

// ── Period picker (dropdown) ─────────────────────────────────────────

function PeriodPicker({ value, onChange }) {
  const data = window.DASHBOARD_DATA || {};
  const curPeriod = data.period || '';                       // '2026-03' | '2026' | 'YYYY-MM'
  const curLabel = data.period_label || 'Tháng này';
  const initYear = /^\d{4}/.test(curPeriod) ? parseInt(curPeriod.slice(0,4),10) : new Date().getFullYear();
  const initMonth = /^\d{4}-\d{2}$/.test(curPeriod) ? parseInt(curPeriod.slice(5,7),10) - 1 : new Date().getMonth();

  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState('month');
  const [gridYear, setGridYear] = React.useState(initYear);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Điều hướng = reload trang với query param để data.php lọc lại
  const go = (qs) => { window.location.search = qs; };
  const ymd = (d) => d.toISOString().slice(0,10);
  const applyPreset = (id) => {
    const today = new Date(); let from = new Date(); let to = new Date();
    if (id === 'today') { /* from=to=today */ }
    else if (id === 'yesterday') { from.setDate(today.getDate()-1); to.setDate(today.getDate()-1); }
    else if (id === '7days') { from.setDate(today.getDate()-6); }
    else if (id === '30days') { from.setDate(today.getDate()-29); }
    go(`?from=${ymd(from)}&to=${ymd(to)}`);
  };
  const applyRange = (id) => {
    const now = new Date(); const y = now.getFullYear(); const m = now.getMonth();
    if (id === 'this-month') go(`?period=${y}-${String(m+1).padStart(2,'0')}`);
    else if (id === 'last-month') { const d = new Date(y, m-1, 1); go(`?period=${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); }
    else if (id === 'this-quarter') { const qStart = Math.floor(m/3)*3; go(`?from=${y}-${String(qStart+1).padStart(2,'0')}-01&to=${ymd(new Date(y, qStart+3, 0))}`); }
    else if (id === 'this-year') go(`?year=${y}`);
  };

  const presets = [
    { id:'today', label:'Hôm nay' },
    { id:'yesterday', label:'Hôm qua' },
    { id:'7days', label:'7 ngày' },
    { id:'30days', label:'30 ngày' },
  ];
  const ranges = [
    { id:'this-month', label:'Tháng này' },
    { id:'last-month', label:'Tháng trước' },
    { id:'this-quarter', label:'Quý này' },
    { id:'this-year', label:'Năm nay' },
  ];

  return (
    <div className="period-picker" ref={ref}>
      <div className="period">
        <button onClick={()=>{ const d=new Date(initYear, initMonth-1, 1); go(`?period=${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); }} title="Tháng trước">‹</button>
        <button className="period-label" onClick={() => setOpen(!open)}
                style={{padding:'7px 12px', fontSize:12.5, fontWeight:700, display:'flex', alignItems:'center', gap:6}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          {curLabel}
          <span style={{fontSize:9, opacity:0.6, marginLeft:2}}>▼</span>
        </button>
        <button onClick={()=>{ const d=new Date(initYear, initMonth+1, 1); go(`?period=${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); }} title="Tháng sau">›</button>
      </div>

      {open && (
        <div className="period-panel">
          <div style={{padding:'12px 14px', borderBottom:'1px solid var(--line-2)'}}>
            <div style={{display:'flex', gap:6, marginBottom:10}}>
              <button className={'tab '+(mode==='month'?'active':'')} onClick={()=>setMode('month')}>Theo tháng</button>
              <button className={'tab '+(mode==='range'?'active':'')} onClick={()=>setMode('range')}>Theo phạm vi</button>
              <button className={'tab '+(mode==='year'?'active':'')} onClick={()=>setMode('year')}>Theo năm</button>
            </div>
          </div>

          <div style={{padding:14}}>
            <div style={{fontSize:10.5, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:700, marginBottom:8}}>Khoảng nhanh</div>
            <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:14}}>
              {presets.map(p => (
                <button key={p.id} className="chip" onClick={()=>applyPreset(p.id)} style={{padding:'5px 12px', fontSize:11.5, background:'var(--surface-2)', cursor:'pointer'}}>{p.label}</button>
              ))}
            </div>
            <div style={{fontSize:10.5, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:700, marginBottom:8}}>Kỳ định sẵn</div>
            <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:14}}>
              {ranges.map(p => (
                <button key={p.id} className="chip" onClick={()=>applyRange(p.id)} style={{padding:'5px 12px', fontSize:11.5, background:'var(--surface-2)', cursor:'pointer'}}>{p.label}</button>
              ))}
            </div>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
              <button onClick={()=>setGridYear(gridYear-1)} style={{background:'transparent', border:'none', cursor:'pointer', color:'var(--ink-3)', fontSize:14, padding:4}}>‹</button>
              <div style={{fontWeight:800, fontSize:14}}>{gridYear}</div>
              <button onClick={()=>setGridYear(gridYear+1)} style={{background:'transparent', border:'none', cursor:'pointer', color:'var(--ink-3)', fontSize:14, padding:4}}>›</button>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6}}>
              {Array.from({length:12}).map((_,i) => {
                const sel = (gridYear===initYear && i===initMonth);
                return (
                <button key={i} className="chip"
                  onClick={()=>go(`?period=${gridYear}-${String(i+1).padStart(2,'0')}`)}
                  style={{
                  padding:'10px 4px', fontSize:12, cursor:'pointer',
                  background: sel ? 'var(--brand-1)' : 'var(--surface-2)',
                  color: sel ? '#fff' : 'var(--ink-2)',
                  border:'none',
                }}>T{i+1}</button>
              );})}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Notifications dropdown ────────────────────────────────────────────

function NotificationsBtn() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const notifs = [
    { type:'warning', title:'Token Lazada hết hạn', time:'11 phút trước', body:'Vui lòng cấp quyền lại để tiếp tục đồng bộ đơn hàng.' },
    { type:'success', title:'Đối soát GBS hoàn thành', time:'1 giờ trước', body:'1.046 đơn khớp, 174 đơn cần xem xét chênh lệch.' },
    { type:'info', title:'24 đơn hàng mới từ Shopee', time:'3 giờ trước', body:'Đã tự động đồng bộ qua cron job sáng nay.' },
    { type:'info', title:'Đạt 78% mục tiêu năm', time:'Hôm qua', body:'Tốc độ tăng trưởng đang vượt run-rate cần thiết.' },
  ];

  return (
    <div ref={ref} style={{position:'relative'}}>
      <button className="icon-btn" onClick={()=>setOpen(!open)}>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        <span className="dot"/>
      </button>
      {open && (
        <div className="popover" style={{width: 340, padding:0}}>
          <div style={{padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid var(--line-2)'}}>
            <div style={{fontWeight:800, fontSize:14}}>Thông báo</div>
            <button style={{background:'transparent', border:'none', cursor:'pointer', color:'var(--brand-1)', fontSize:12, fontWeight:600, fontFamily:'inherit'}}>Đánh dấu đã đọc</button>
          </div>
          <div style={{maxHeight:380, overflowY:'auto'}}>
            {notifs.map((n,i) => (
              <div key={i} style={{padding:'12px 16px', borderBottom:'1px solid var(--line-2)', display:'flex', gap:12, cursor:'pointer', transition:'background 0.15s'}}
                   onMouseEnter={(e)=>e.currentTarget.style.background='var(--surface-2)'}
                   onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}>
                <div style={{
                  width:30, height:30, borderRadius:8, flexShrink:0,
                  display:'grid', placeItems:'center',
                  background: n.type==='warning' ? 'rgba(245,158,11,0.14)' : n.type==='success' ? 'rgba(16,185,129,0.14)' : 'var(--brand-glow)',
                  color: n.type==='warning' ? 'var(--amber)' : n.type==='success' ? 'var(--green)' : 'var(--brand-1)',
                }}>
                  {n.type==='warning' ? '!' : n.type==='success' ? '✓' : 'i'}
                </div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8}}>
                    <div style={{fontSize:13, fontWeight:700}}>{n.title}</div>
                    <div style={{fontSize:10.5, color:'var(--ink-3)', whiteSpace:'nowrap', fontWeight:500}}>{n.time}</div>
                  </div>
                  <div style={{fontSize:11.5, color:'var(--ink-3)', marginTop:3, lineHeight:1.4}}>{n.body}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{padding:'10px 16px', textAlign:'center', borderTop:'1px solid var(--line-2)'}}>
            <button style={{background:'transparent', border:'none', cursor:'pointer', color:'var(--brand-1)', fontSize:12, fontWeight:700, fontFamily:'inherit'}}>Xem tất cả thông báo →</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── User menu ─────────────────────────────────────────────────────────

function UserMenu({ onNav, onLogout }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{position:'relative'}}>
      <button onClick={()=>setOpen(!open)} className="user-btn">
        <div className="user-avatar" style={{width:32, height:32, fontSize:11}}>AD</div>
        <div style={{textAlign:'left'}}>
          <div style={{fontSize:12.5, fontWeight:700}}>Admin</div>
          <div style={{fontSize:10.5, color:'var(--ink-3)', fontWeight:600}}>Quản trị viên</div>
        </div>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {open && (
        <div className="popover" style={{width: 280}}>
          <div style={{display:'flex', alignItems:'center', gap:12, padding:'14px 16px', borderBottom:'1px solid var(--line-2)'}}>
            <div className="user-avatar" style={{width:44, height:44, fontSize:14}}>AD</div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:14, fontWeight:800}}>Nguyễn Quản Trị</div>
              <div style={{fontSize:11.5, color:'var(--ink-3)'}}>@admin · Quản trị viên</div>
            </div>
          </div>
          <div style={{padding:6}}>
            <MenuItem icon="user" label="Hồ sơ tài khoản" onClick={()=>{setOpen(false); onNav('settings');}}/>
            <MenuItem icon="lock" label="Đổi mật khẩu" onClick={()=>{setOpen(false); onNav('settings');}}/>
            <MenuItem icon="lang" label="Ngôn ngữ" sub="Tiếng Việt" onClick={()=>{setOpen(false); onNav('settings');}}/>
            <MenuItem icon="shield" label="Quản trị hệ thống" onClick={()=>{setOpen(false); onNav('admin');}}/>
          </div>
          <div style={{padding:6, borderTop:'1px solid var(--line-2)'}}>
            <MenuItem icon="logout" label="Đăng xuất" danger onClick={onLogout}/>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, sub, onClick, danger }) {
  const icons = {
    user: <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>,
    lock: <><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V8a5 5 0 0110 0v3"/></>,
    lang: <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
    logout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
  };
  return (
    <div onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:10,
      padding:'9px 12px', borderRadius:8, cursor:'pointer',
      fontSize:13, fontWeight:500,
      color: danger ? 'var(--red)' : 'var(--ink)',
      transition:'background 0.15s',
    }}
    onMouseEnter={(e)=>e.currentTarget.style.background='var(--surface-2)'}
    onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {icons[icon]}
      </svg>
      <span style={{flex:1}}>{label}</span>
      {sub && <span style={{fontSize:11, color:'var(--ink-3)'}}>{sub}</span>}
    </div>
  );
}

// ── Topbar ───────────────────────────────────────────────────────────

function Topbar({ page, onNav, platform, onPlatform, viewMode, onViewMode, onLogout }) {
  const pageDef = ALL_PAGES[page];
  return (
    <header className="topbar">
      <div>
        <div className="page-title">{pageDef.label}</div>
        <div className="page-sub">{pageDef.sub}</div>
      </div>
      <div className="spacer" />

      <div className="search-bar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input placeholder="Tìm đơn hàng, SKU, khách hàng…"/>
        <kbd>⌘K</kbd>
      </div>

      <div className="platform-chips">
        {[
          { id:'all', name:'Tất cả', color: 'var(--ink-3)' },
          { id:'shopee', name:'Shopee', color: PLATFORM_COLORS.shopee },
          { id:'lazada', name:'Lazada', color: PLATFORM_COLORS.lazada },
          { id:'tiktok', name:'TikTok', color: PLATFORM_COLORS.tiktok },
        ].map(p => (
          <button key={p.id} onClick={() => onPlatform(p.id)}
                  className={'chip ' + (platform===p.id?'active':'')}>
            <span className="chip-dot" style={{background:p.color}}/>
            {p.name}
          </button>
        ))}
      </div>

      <div className="vmode" title="COMBO: nguyên gốc từ sàn · SKU: tách thành sản phẩm đơn lẻ">
        <button className={'chip '+(viewMode==='combo'?'active':'')} onClick={()=>onViewMode('combo')}>COMBO</button>
        <button className={'chip '+(viewMode==='sku'?'active':'')} onClick={()=>onViewMode('sku')}>SKU</button>
      </div>

      <PeriodPicker/>
      <NotificationsBtn/>
    </header>
  );
}

// ── Login screen ──────────────────────────────────────────────────────

function LoginScreen({ onLogin }) {
  const [user, setUser] = React.useState('admin');
  const [pass, setPass] = React.useState('demo1234');
  const [busy, setBusy] = React.useState(false);
  const submit = (e) => {
    if (e) e.preventDefault();
    setBusy(true);
    setTimeout(() => { setBusy(false); onLogin(); }, 600);
  };
  return (
    <div className="login-screen">
      <div className="login-bg">
        <div className="login-blob a"/>
        <div className="login-blob b"/>
        <div className="login-blob c"/>
      </div>
      <div className="login-grid">
        <div className="login-promo">
          <div className="login-brand">
            <div className="brand-logo" style={{width:48, height:48}}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12 L7 16 L11 8 L15 14 L21 6"/>
              </svg>
            </div>
            <div style={{color:'#fff'}}>
              <div style={{fontSize:22, fontWeight:800, letterSpacing:'-0.02em'}}>Insight</div>
              <div style={{fontSize:12, opacity:0.7}}>TMĐT Suite · {(window.__BETA__?.versionLabel || 'Beta')}</div>
            </div>
          </div>
          <h1 style={{color:'#fff', fontSize:42, fontWeight:800, letterSpacing:'-0.03em', marginTop:48, lineHeight:1.1}}>
            Quản lý kinh doanh<br/>đa sàn TMĐT, đẹp & gọn
          </h1>
          <p style={{color:'rgba(255,255,255,0.7)', fontSize:15, marginTop:14, lineHeight:1.55, maxWidth:380}}>
            Phân tích Shopee, Lazada, TikTok Shop trên một giao diện thống nhất. Theo dõi mục tiêu năm, đối soát GBS, và khám phá insight từ dữ liệu thực tế.
          </p>
          <div style={{display:'flex', gap:24, marginTop:38}}>
            <div>
              <div style={{color:'#fff', fontSize:30, fontWeight:800, letterSpacing:'-0.02em'}}>243M₫</div>
              <div style={{color:'rgba(255,255,255,0.6)', fontSize:11.5, marginTop:2}}>Doanh thu tháng 03</div>
            </div>
            <div style={{width:1, background:'rgba(255,255,255,0.15)'}}/>
            <div>
              <div style={{color:'#fff', fontSize:30, fontWeight:800, letterSpacing:'-0.02em'}}>1.220</div>
              <div style={{color:'rgba(255,255,255,0.6)', fontSize:11.5, marginTop:2}}>Đơn hàng đã xử lý</div>
            </div>
            <div style={{width:1, background:'rgba(255,255,255,0.15)'}}/>
            <div>
              <div style={{color:'#fff', fontSize:30, fontWeight:800, letterSpacing:'-0.02em'}}>3 sàn</div>
              <div style={{color:'rgba(255,255,255,0.6)', fontSize:11.5, marginTop:2}}>Đồng bộ realtime</div>
            </div>
          </div>
        </div>
        <div className="login-card">
          <div style={{fontSize:11.5, color:'var(--ink-3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em'}}>Đăng nhập</div>
          <h2 style={{fontSize:24, fontWeight:800, marginTop:6, letterSpacing:'-0.02em'}}>Chào mừng trở lại</h2>
          <div style={{fontSize:13, color:'var(--ink-3)', marginTop:6}}>Vui lòng đăng nhập để truy cập dashboard.</div>
          <form onSubmit={submit} style={{marginTop:28, display:'flex', flexDirection:'column', gap:14}}>
            <div>
              <label className="login-label">Tên đăng nhập</label>
              <input className="login-input" value={user} onChange={e=>setUser(e.target.value)} autoFocus/>
            </div>
            <div>
              <label className="login-label">Mật khẩu</label>
              <input className="login-input" type="password" value={pass} onChange={e=>setPass(e.target.value)}/>
            </div>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12}}>
              <label style={{display:'flex', alignItems:'center', gap:6, cursor:'pointer', color:'var(--ink-2)', fontWeight:500}}>
                <input type="checkbox" defaultChecked/>
                Ghi nhớ đăng nhập
              </label>
              <a style={{color:'var(--brand-1)', textDecoration:'none', fontWeight:600}}>Quên mật khẩu?</a>
            </div>
            <button type="submit" className="login-btn" disabled={busy}>
              {busy ? 'Đang đăng nhập…' : 'Đăng nhập →'}
            </button>
          </form>
          <div style={{marginTop:22, padding:14, background:'var(--surface-2)', borderRadius:12, fontSize:11.5, color:'var(--ink-3)', textAlign:'center'}}>
            Demo · sử dụng <strong style={{color:'var(--ink-2)', fontFamily:'JetBrains Mono'}}>admin / demo1234</strong> để truy cập
          </div>
        </div>
      </div>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────

function App() {
  const [tweaks, setTweak] = useTweaks(window.TWEAK_DEFAULTS);
  const [page, setPage] = React.useState('overview');
  const [platform, setPlatform] = React.useState('all');
  const [viewMode, setViewMode] = React.useState('combo');
  const [collapsed, setCollapsed] = React.useState(false);
  // Auth đã được xử lý bởi PHP gate (beta/index.php) → vào thẳng, không hiện login mockup
  const beta = window.__BETA__ || {};
  const currentUser = { name: beta.username || 'Admin', role: beta.isAdmin ? 'admin' : 'staff' };
  const [loggedIn, setLoggedIn] = React.useState(true);

  React.useEffect(() => {
    document.body.dataset.palette = tweaks.palette;
    document.body.dataset.theme = tweaks.theme;
    document.body.dataset.density = tweaks.density;
  }, [tweaks.palette, tweaks.theme, tweaks.density]);

  const data = window.DASHBOARD_DATA;
  if (!data) return <div className="loading">Đang tải dữ liệu…</div>;

  // Filter data by platform
  const filteredData = React.useMemo(() => {
    if (platform === 'all') return data;
    const fd = JSON.parse(JSON.stringify(data));
    fd.revenue_series = data.revenue_series.map(d => ({
      ...d,
      total: d[platform] || 0,
      orders_total: d['orders_'+platform] || 0,
      ...['shopee','lazada','tiktok'].filter(p=>p!==platform).reduce((acc,p)=>{
        acc[p] = 0; acc['orders_'+p] = 0; return acc;
      }, {}),
    }));
    const sp = data.summary[platform];
    const traffic = data.traffic.filter(t => t.platform === platform);
    const totalPageViews = traffic.reduce((sum, t) => sum + (t.page_views || 0), 0);
    const totalVisitors = traffic.reduce((sum, t) => sum + (t.visitors || 0), 0);
    fd.summary = {
      ...fd.summary,
      total_orders: sp.orders || 0,
      completed_orders: sp.completed || 0,
      cancelled_orders: sp.cancelled || 0,
      shipping_orders: sp.shipping || 0,
      cancel_rate: sp.orders ? ((sp.cancelled || 0) / sp.orders * 100) : 0,
      total_revenue: sp.revenue || 0,
      avg_order_value: sp.completed ? Math.round((sp.revenue || 0) / sp.completed) : 0,
      total_page_views: totalPageViews,
      total_visitors: totalVisitors,
    };
    fd.traffic = traffic;
    fd.top_products_qty = data.top_products_qty.filter(t => t.platform === platform);
    fd.top_products_rev = data.top_products_rev.filter(t => t.platform === platform);
    fd.recent_orders = data.recent_orders.filter(o => o.platform === platform);
    return fd;
  }, [platform, data]);

  if (!loggedIn) {
    return <>
      <LoginScreen onLogin={() => setLoggedIn(true)}/>
      {renderTweaks(tweaks, setTweak)}
    </>;
  }

  const PageComp = PAGE_COMP[page];

  return (
    <div className={'shell' + (collapsed ? ' shell-collapsed' : '')}>
      <Sidebar active={page} onNav={setPage} collapsed={collapsed}
               onCollapse={()=>setCollapsed(!collapsed)}
               userRole={currentUser.role} user={currentUser}
               onLogout={()=>{ window.location.href = beta.backUrl || '../index.php'; }}/>
      <main className="main">
        <Topbar page={page} onNav={setPage}
                platform={platform} onPlatform={setPlatform}
                viewMode={viewMode} onViewMode={setViewMode}
                onLogout={()=>{ window.location.href = beta.backUrl || '../index.php'; }} />
        <div className="content">
          <PageComp data={filteredData} mode={tweaks.chartStyle} key={page+platform}/>
        </div>
      </main>
      {renderTweaks(tweaks, setTweak)}
    </div>
  );
}

function renderTweaks(tweaks, setTweak) {
  const palettes = {
    indigo: ['#5B5BF0','#7C3AED','#4338CA','#FF5C8A'],
    sunset: ['#F97316','#DC2626','#B91C1C','#FBBF24'],
    emerald:['#10B981','#059669','#047857','#FCD34D'],
    violet: ['#A855F7','#6366F1','#4F46E5','#22D3EE'],
  };
  return (
    <TweaksPanel title="Tuỳ chỉnh giao diện">
      <TweakSection label="Bảng màu thương hiệu">
        <TweakColor label="Palette"
          value={palettes[tweaks.palette] || palettes.indigo}
          options={Object.values(palettes)}
          onChange={(palette) => {
            const m = { '#5B5BF0': 'indigo', '#F97316': 'sunset', '#10B981': 'emerald', '#A855F7': 'violet' };
            setTweak('palette', m[palette[0]] || 'indigo');
          }} />
      </TweakSection>
      <TweakSection label="Chế độ hiển thị">
        <TweakRadio label="Theme" value={tweaks.theme}
                    options={['light','dark']}
                    onChange={(v)=>setTweak('theme', v)} />
      </TweakSection>
      <TweakSection label="Mật độ thông tin">
        <TweakRadio label="Density" value={tweaks.density}
                    options={['compact','balanced','spacious']}
                    onChange={(v)=>setTweak('density', v)} />
      </TweakSection>
      <TweakSection label="Kiểu biểu đồ">
        <TweakRadio label="Chart" value={tweaks.chartStyle}
                    options={['line','area','bar']}
                    onChange={(v)=>setTweak('chartStyle', v)} />
      </TweakSection>
    </TweaksPanel>
  );
}

document.body.dataset.palette = window.TWEAK_DEFAULTS.palette;
document.body.dataset.theme = window.TWEAK_DEFAULTS.theme;
document.body.dataset.density = window.TWEAK_DEFAULTS.density;

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
