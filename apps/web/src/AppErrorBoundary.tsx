import { Component, createRef, type ReactNode } from 'react';

export default class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  heading = createRef<HTMLHeadingElement>();
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.heading.current?.focus(); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="center-state">
      <h1 ref={this.heading} tabIndex={-1} role="alert">This section could not be opened</h1>
      <p>Check your connection. Reload authoritative records before retrying a submission.</p>
      <div className="row wrap"><a className="button primary" href={window.location.href}>Reload this section</a><a className="button secondary" href="/">Public home</a></div>
    </main>;
  }
}
