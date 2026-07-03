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
import {
  ClipboardList,
  Check,
  X,
  Loader2,
  AlertCircle,
  Shield,
  Clock,
  User,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface PolicyStatement {
  Effect: string;
  Action: string[];
  Resource: string[];
}

interface PendingRequest {
  requestId: string;
  userEmail: string;
  userName: string;
  accountName: string;
  accountId: string;
  taskDescription: string;
  justification: string;
  requestedDurationHours: number;
  createdAt: string;
  policy: {
    source: string;
    name: string;
    description: string;
    statements: PolicyStatement[];
  } | null;
}

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchPendingRequests();
  }, []);

  const fetchPendingRequests = async () => {
    try {
      const response = await fetch("/api/requests?status=pending");
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests || []);
      }
    } catch {
      setError("Failed to load pending requests");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    setActionLoading(requestId);
    setError(null);

    try {
      const response = await fetch(`/api/requests/${requestId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Approved via admin panel" }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Approval failed");
        return;
      }

      // Remove from pending list
      setRequests((prev) => prev.filter((r) => r.requestId !== requestId));
    } catch {
      setError("Network error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeny = async (requestId: string) => {
    const reason = denyReason[requestId];
    if (!reason || reason.length < 5) {
      setError("Please provide a denial reason (min 5 characters)");
      return;
    }

    setActionLoading(requestId);
    setError(null);

    try {
      const response = await fetch(`/api/requests/${requestId}/deny`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: reason }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Denial failed");
        return;
      }

      // Remove from pending list
      setRequests((prev) => prev.filter((r) => r.requestId !== requestId));
    } catch {
      setError("Network error");
    } finally {
      setActionLoading(null);
    }
  };

  const toggleExpand = (requestId: string) => {
    setExpandedRequest(expandedRequest === requestId ? null : requestId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ClipboardList className="h-7 w-7 text-purple-500" />
          Approval Queue
        </h1>
        <p className="text-muted-foreground">
          Review and approve Lane B access requests. Each request includes an
          AI-generated or matched policy for your review.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-auto text-xs underline"
          >
            dismiss
          </button>
        </div>
      )}

      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No pending requests</p>
              <p className="text-xs mt-1">
                New requests will appear here for review
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <Card key={req.requestId} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Badge
                        variant={
                          req.policy?.source === "matched"
                            ? "secondary"
                            : "default"
                        }
                      >
                        {req.policy?.source === "matched"
                          ? "Matched Policy"
                          : "AI Generated"}
                      </Badge>
                      {req.accountName}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {req.userEmail}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {req.requestedDurationHours}h requested
                      </span>
                      <span className="text-xs">
                        {new Date(req.createdAt).toLocaleString()}
                      </span>
                    </CardDescription>
                  </div>
                  <button
                    onClick={() => toggleExpand(req.requestId)}
                    className="p-1 rounded hover:bg-accent"
                    aria-label="Toggle details"
                  >
                    {expandedRequest === req.requestId ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Task & justification — always visible */}
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase">
                      Task
                    </p>
                    <p className="text-sm">{req.taskDescription}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase">
                      Justification
                    </p>
                    <p className="text-sm">{req.justification}</p>
                  </div>
                </div>

                {/* Policy details — expandable */}
                {expandedRequest === req.requestId && req.policy && (
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium">
                        {req.policy.name}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {req.policy.description}
                    </p>
                    <div className="rounded-md bg-muted p-3 font-mono text-xs overflow-x-auto max-h-48 overflow-y-auto">
                      <pre>
                        {JSON.stringify(
                          { Statement: req.policy.statements },
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    onClick={() => handleApprove(req.requestId)}
                    disabled={actionLoading === req.requestId}
                  >
                    {actionLoading === req.requestId ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-3 w-3" />
                    )}
                    Approve
                  </Button>

                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Denial reason..."
                      className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
                      value={denyReason[req.requestId] || ""}
                      onChange={(e) =>
                        setDenyReason((prev) => ({
                          ...prev,
                          [req.requestId]: e.target.value,
                        }))
                      }
                      disabled={actionLoading === req.requestId}
                    />
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeny(req.requestId)}
                      disabled={
                        actionLoading === req.requestId ||
                        (denyReason[req.requestId]?.length || 0) < 5
                      }
                    >
                      <X className="mr-2 h-3 w-3" />
                      Deny
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
