import { Link } from 'react-router';
import { ArrowRight, ArrowUpRight, CircleHelp, ClipboardCheck, FileCheck2, Leaf, MapPin, ShieldCheck, Sprout, Truck, Users } from 'lucide-react';

const pages = ['how-it-works','accepted-materials','for-businesses','for-partners','service-areas','contact','privacy','terms'];
const steps = [
  { Icon: ClipboardCheck, number: '01', title: 'Start with your site', description: 'We assess your setup, agree a suitable service and help your team separate the right materials.' },
  { Icon: Truck, number: '02', title: 'Keep collection dependable', description: 'Assigned routes, clear schedules and measured collection records support day-to-day operations.' },
  { Icon: Sprout, number: '03', title: 'Know what happens next', description: 'Independent receiving, visible discrepancies and separate treatment records keep reporting grounded.' }
];
const Logo = () => <img className="logo" src="/logo.png" alt="EcoGrowth"/>;

// This route deliberately imports no auth client, protected cache, forms, charts or domain ledger.
export default function Landing({demo=import.meta.env?.VITE_DEMO_MODE!=='false'}:{demo?:boolean}={}) {
  return <div className="public">
    <header className="public-header">
      <Link to="/" aria-label="EcoGrowth home"><Logo/></Link>
      <nav aria-label="Public navigation"><Link to="/how-it-works">How it works</Link><Link to="/for-businesses">For businesses</Link><Link to="/service-areas">Service areas</Link></nav>
      <Link className="button secondary" to="/login">Sign in <ArrowUpRight size={15}/></Link>
    </header>
    <main>
      <section className="hero">
        <div>
          <span className="eyebrow"><span className="small-leaf"><Leaf size={14}/></span> A BETTER WAY TO HANDLE ORGANICS</span>
          <h1>Less waste.<br/>More <span>possibility.</span></h1>
          <p>Manage organic-waste collection for your business. View your schedule, track pickups and check invoices in one place.</p>
          <div className="row wrap"><Link className="button primary large" to="/quote-request">Request a site assessment <ArrowUpRight size={18}/></Link><Link className="text-link" to="/how-it-works">See how it works <ArrowRight size={16}/></Link></div>
          <div className="hero-foot"><ShieldCheck size={19}/><span>Clear service. Traceable records. Honest reporting.</span></div>
        </div>
        <div className="hero-visual">
          <div className="orbit orbit-one"/><div className="orbit orbit-two"/>
          <div className="plant-mark"><Sprout size={130} strokeWidth={1.2}/></div>
          <div className="floating-card card-top"><span className="square-icon"><Truck size={21}/></span><div><strong>A dependable collection</strong><small>Assigned. Recorded. Accountable.</small></div><ShieldCheck size={18}/></div>
          <div className="floating-card card-bottom"><span className="square-icon"><ShieldCheck size={22}/></span><div><strong>Evidence, not assumptions</strong><small>Pickup ≠ verified composting</small></div></div>
          <span className="visual-label">ROOTED IN LIBERIA. BUILT TO GROW.</span>
        </div>
      </section>
      <section className="principle-strip">
        <div><MapPin size={20}/><span>Starting with a Sinkor pilot</span></div>
        <div><Users size={20}/><span>Designed for food businesses</span></div>
        <div><FileCheck2 size={20}/><span>Independent receiving records</span></div>
      </section>
      <section className="public-section">
        <div className="section-heading"><div><span className="eyebrow">SIMPLE STEPS. RESPONSIBLE SERVICE.</span><h2>From separation to a clearer picture.</h2></div><Link className="text-link" to="/how-it-works">Explore the process <ArrowUpRight size={16}/></Link></div>
        <div className="three-grid">{steps.map(({Icon,number,title,description})=><article className="process-card" key={number}><div className="row between"><span className="square-icon"><Icon size={24}/></span><span className="step-number">{number}</span></div><h3>{title}</h3><p>{description}</p></article>)}</div>
      </section>
      <section className="public-cta"><div><span className="eyebrow">BETTER HABITS START AT THE SOURCE</span><h2>Your food scraps deserve<br/>a more responsible next step.</h2><p>Organics recovery complements—not automatically replaces—your residual collection service.</p></div><Link className="button white" to="/accepted-materials">What goes in the container? <ArrowUpRight size={18}/></Link></section>
      <aside className="demo-note"><CircleHelp size={18}/><span>{demo?<><strong>Demonstration environment.</strong> All businesses and providers shown are fictional.</>:<><strong>Service by agreement.</strong> Coverage, pricing and collection dates require confirmation. A pickup record does not confirm composting.</>}</span></aside>
    </main>
    <footer className="public-footer">
      <div><Logo/><p>Organics, accounted for.</p><small>Monrovia, Liberia · Built for dependable operations.</small></div>
      <nav aria-label="Footer">{pages.map(page=><Link key={page} to={'/'+page}>{page.replaceAll('-',' ')}</Link>)}</nav>
      <small>© EcoGrowth. {demo?'Demonstration environment.':'Collection and receiving records.'}</small>
    </footer>
  </div>;
}
