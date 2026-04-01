"use client";

import { Component, useEffect, useState, type ReactNode } from "react";

// Error boundary catches render-time crashes
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error: `${error.message}\n${error.stack}` };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, background: "#ff0000", color: "#fff", fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap", position: "fixed", inset: 0, zIndex: 99999, overflow: "auto" }}>
          <h2>RENDER ERROR:</h2>
          <p>{this.state.error}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function HydrationCheck() {
  const [status, setStatus] = useState("LOADING...");

  useEffect(() => {
    setStatus("HYDRATED OK");
  }, []);

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 99999, background: status === "HYDRATED OK" ? "#00cc00" : "#ff8800", color: "#fff", fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}>
      {status}
    </div>
  );
}

import FlappyBird from "@/components/FlappyBird";

export default function Home() {
  return (
    <ErrorBoundary>
      <HydrationCheck />
      <FlappyBird />
    </ErrorBoundary>
  );
}
