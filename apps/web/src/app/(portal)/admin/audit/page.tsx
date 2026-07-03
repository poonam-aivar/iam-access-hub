"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Loader2, Search, RefreshCw } from "lucide-react";

interface AuditLogEntry {
  logId: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  action: string;
  lane: string;
  accountId: string;
  accountName: string;
  metadata: Record<string, string>;
  ipAddress: string;
}

const actionLabels: Record<string, string> = {
  session_created: "Session Created",
  session_expired: "Session Expired",
  session_revoked: "Session Revoked",
  request_submitted: "Request Submitted",
  request_approved: "Request Approved",
  request_denied: "Request Denied",
  policy_generated: "Policy Generated",
  policy_matched: "Policy Matched",
  credentials_vended: "Credentials Vended",
  login: "Login",
  logout: "Logout",
};

const actionColors: Record<string, "default" | "success" | "destructive" | "warning" | "secondary"> = {
  session_created: "success",
  credentials_vended: "success",
  request_approved: "success",
  request_denied: "destructive",
  session_revoked: "warning",
  request_submitted: "default",
  policy_generated: "secondary",
  policy_matched: "secondary",
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    accountId: "",
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.accountId) params.set("accountId", filters.accountId);
      if (filters.startDate) params.set("startDate", filters.startDate);
      if (filters.endDate) params.set("endDate", filters.endDate);

      const response = await fetch(`/api/audit?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-7 w-7 text-red-500" />
            Audit Logs
          </h1>
          <p className="text-muted-foreground">
            Complete trail of all access sessions, requests, approvals, and
            credential vending — both lanes.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchLogs}
          disabled={loading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Start Date
              </label>
              <input
                type="date"
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, startDate: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                End Date
              </label>
              <input
                type="date"
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, endDate: e.target.value }))
                }
              />
            </div>
            <Button size="sm" onClick={fetchLogs}>
              <Search className="mr-2 h-3 w-3" />
              Filter
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilters({ accountId: "", startDate: "", endDate: "" });
                fetchLogs();
              }}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
          <CardDescription>{logs.length} entries</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No audit logs found</p>
              <p className="text-xs mt-1">
                Activity will be recorded as users interact with the portal
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">
                      Time
                    </th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">
                      User
                    </th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">
                      Action
                    </th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">
                      Lane
                    </th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">
                      Account
                    </th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">
                      IP
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.logId} className="border-b last:border-0">
                      <td className="py-2 px-2 whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-xs">
                        {log.userEmail}
                      </td>
                      <td className="py-2 px-2">
                        <Badge
                          variant={actionColors[log.action] || "outline"}
                        >
                          {actionLabels[log.action] || log.action}
                        </Badge>
                      </td>
                      <td className="py-2 px-2">
                        <Badge variant="outline">
                          {log.lane === "lane-a" ? "SSO" : "Request"}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-xs">
                        {log.accountName}
                      </td>
                      <td className="py-2 px-2 text-xs text-muted-foreground font-mono">
                        {log.ipAddress}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
