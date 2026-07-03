"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Zap,
  FileText,
  Shield,
  Clock,
  Loader2,
  Trash2,
  RefreshCw,
} from "lucide-react";

interface DashboardStats {
  activeSessions: number;
  pendingRequests: number;
  policyCount: number;
  sessionsToday: number;
}

interface ActiveSession {
  sessionId: string;
  lane: string;
  accountName: string;
  roleName: string;
  createdAt: string;
  expiresAt: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, sessionsRes] = await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/sessions"),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
      if (sessionsRes.ok) {
        const sessionsData = await sessionsRes.json();
        setSessions(sessionsData.sessions || []);
      }
    } catch {
      // Silent fail — show zeros
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (sessionId: string) => {
    setRevoking(sessionId);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/revoke`, {
        method: "POST",
      });
      if (response.ok) {
        setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
        if (stats) {
          setStats({ ...stats, activeSessions: stats.activeSessions - 1 });
        }
      }
    } catch {
      // Silent fail
    } finally {
      setRevoking(null);
    }
  };

  const timeRemaining = (expiresAt: string) => {
    const mins = Math.max(
      0,
      Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000)
    );
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Self-service AWS access — instant for SSO, approval-based for
            others.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Sessions
            </CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "—" : stats?.activeSessions ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">of 2 max per user</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pending Requests
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "—" : stats?.pendingRequests ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">awaiting approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Policies in Library
            </CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "—" : stats?.policyCount ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">reusable policies</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Sessions Today
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "—" : stats?.sessionsToday ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">across all lanes</p>
          </CardContent>
        </Card>
      </div>

      {/* Active sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your Active Sessions</CardTitle>
          <CardDescription>
            Sessions auto-expire. You can revoke them early if you&apos;re done.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Clock className="h-6 w-6 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No active sessions</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((s) => (
                <div
                  key={s.sessionId}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={s.lane === "lane-a" ? "default" : "secondary"}
                    >
                      {s.lane === "lane-a" ? "SSO" : "Request"}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">{s.accountName}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.roleName} · Expires in {timeRemaining(s.expiresAt)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(s.sessionId)}
                    disabled={revoking === s.sessionId}
                  >
                    {revoking === s.sessionId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-destructive" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/lane-a">
          <Card className="cursor-pointer hover:border-blue-300 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-blue-500" />
                Lane A — Instant Access
              </CardTitle>
              <CardDescription>
                SSO users: get immediate console/CLI access to accounts you
                already have permission for.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="success">No approval required</Badge>
            </CardContent>
          </Card>
        </Link>

        <Link href="/lane-b">
          <Card className="cursor-pointer hover:border-orange-300 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-orange-500" />
                Lane B — Request Access
              </CardTitle>
              <CardDescription>
                Describe your task and AI will generate a least-privilege policy.
                DevOps reviews and approves.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="warning">Requires DevOps approval</Badge>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Available Accounts (v1)</CardTitle>
          <CardDescription>
            10 AWS accounts in scope for this portal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[
              "Agentic-Polo",
              "Agentic-Systems",
              "Aivar Agents",
              "Aivar Convogent.dev",
              "Aivar Velogent.dev",
              "Chatbots",
              "Cloud Migration",
              "Cloud Modernization",
              "Document Extraction",
              "mlops",
            ].map((account) => (
              <div
                key={account}
                className="flex items-center gap-2 rounded-md border p-3"
              >
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium">{account}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
