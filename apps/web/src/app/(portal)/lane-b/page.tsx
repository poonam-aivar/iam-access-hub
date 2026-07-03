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
  FileText,
  Send,
  Clock,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Eye,
} from "lucide-react";
import { V1_ACCOUNTS } from "@/config/accounts";

interface PolicyStatement {
  Effect: string;
  Action: string[];
  Resource: string[];
}

interface RequestResponse {
  requestId: string;
  status: string;
  policy: {
    source: string;
    name: string;
    description: string;
    statements: PolicyStatement[];
  } | null;
  message: string;
}

interface AccessRequest {
  requestId: string;
  accountName: string;
  taskDescription: string;
  status: string;
  createdAt: string;
  reviewedBy: string | null;
  reviewNote: string | null;
  policy: {
    name: string;
    source: string;
  } | null;
}

export default function LaneBPage() {
  const [accountId, setAccountId] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [justification, setJustification] = useState("");
  const [durationHours, setDurationHours] = useState(1);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<RequestResponse | null>(null);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [showPolicy, setShowPolicy] = useState(false);

  // Fetch user's existing requests on mount
  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const response = await fetch("/api/requests");
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests || []);
      }
    } catch {
      // Silent fail on load
    }
  };

  const handlePreviewPolicy = async () => {
    if (!accountId || taskDescription.length < 20) {
      setError("Select an account and provide a task description (min 20 chars)");
      return;
    }

    setPreviewLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskDescription, accountId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Policy preview failed");
        return;
      }

      setSubmitResult({
        requestId: "",
        status: "preview",
        policy: data.policy,
        message: "Preview only — not submitted yet",
      });
      setShowPolicy(true);
    } catch {
      setError("Network error");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!accountId || taskDescription.length < 20 || justification.length < 10) {
      setError(
        "All fields are required. Task description min 20 chars, justification min 10 chars."
      );
      return;
    }

    setLoading(true);
    setError(null);
    setSubmitResult(null);

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          taskDescription,
          justification,
          durationHours,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Request submission failed");
        return;
      }

      setSubmitResult(data);
      setShowPolicy(true);

      // Refresh request list
      await fetchRequests();

      // Clear form
      setTaskDescription("");
      setJustification("");
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="warning">Pending</Badge>;
      case "approved":
        return <Badge variant="success">Approved</Badge>;
      case "denied":
        return <Badge variant="destructive">Denied</Badge>;
      case "expired":
        return <Badge variant="secondary">Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="h-7 w-7 text-orange-500" />
          Request Access
        </h1>
        <p className="text-muted-foreground">
          Describe what you need to do. AI will generate a least-privilege
          policy, and DevOps will review it.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Access Request</CardTitle>
          <CardDescription>
            Be specific about your task — the more detail you provide, the more
            accurately the AI can scope your permissions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Account selector */}
          <div className="space-y-2">
            <label htmlFor="account-b" className="text-sm font-medium">
              Target AWS Account
            </label>
            <select
              id="account-b"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              disabled={loading}
            >
              <option value="">Select an account...</option>
              {V1_ACCOUNTS.filter((a) => a.laneBEnabled).map((account) => (
                <option key={account.accountId} value={account.accountId}>
                  {account.accountName}
                </option>
              ))}
            </select>
          </div>

          {/* Task description */}
          <div className="space-y-2">
            <label htmlFor="task" className="text-sm font-medium">
              What do you need to do?
            </label>
            <textarea
              id="task"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-y"
              placeholder="e.g., I need to debug why the order-processing Lambda is failing in prod. I need to view the function config and read its CloudWatch logs."
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              disabled={loading}
              maxLength={500}
            />
            <div className="flex justify-between">
              <p className="text-xs text-muted-foreground">
                Be specific: mention services, resources, and whether you need
                read or write access.
              </p>
              <p className="text-xs text-muted-foreground">
                {taskDescription.length}/500
              </p>
            </div>
          </div>

          {/* Justification */}
          <div className="space-y-2">
            <label htmlFor="justification" className="text-sm font-medium">
              Business Justification
            </label>
            <textarea
              id="justification"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
              placeholder="e.g., Production incident — users reporting errors on checkout flow, need to investigate Lambda execution."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              disabled={loading}
              maxLength={300}
            />
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <label htmlFor="duration-b" className="text-sm font-medium">
              Required Duration
            </label>
            <select
              id="duration-b"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={durationHours}
              onChange={(e) => setDurationHours(Number(e.target.value))}
              disabled={loading}
            >
              <option value={1}>1 hour (recommended)</option>
              <option value={2}>2 hours</option>
              <option value={4}>4 hours (max)</option>
            </select>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handlePreviewPolicy}
              disabled={loading || previewLoading || !accountId || taskDescription.length < 20}
            >
              {previewLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Eye className="mr-2 h-4 w-4" />
              )}
              Preview Policy
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={
                loading ||
                !accountId ||
                taskDescription.length < 20 ||
                justification.length < 10
              }
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Submit Request
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Policy preview / result */}
      {submitResult && showPolicy && submitResult.policy && (
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              {submitResult.status === "preview"
                ? "Policy Preview"
                : "Request Submitted"}
            </CardTitle>
            <CardDescription>{submitResult.message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant={submitResult.policy.source === "matched" ? "secondary" : "default"}>
                {submitResult.policy.source === "matched"
                  ? "Matched from library"
                  : "AI Generated"}
              </Badge>
              <span className="text-sm font-medium">
                {submitResult.policy.name}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {submitResult.policy.description}
            </p>
            <div className="rounded-md bg-background border p-3 font-mono text-xs overflow-x-auto">
              <pre>
                {JSON.stringify(
                  { Statement: submitResult.policy.statements },
                  null,
                  2
                )}
              </pre>
            </div>
            {submitResult.requestId && (
              <p className="text-xs text-muted-foreground">
                Request ID: {submitResult.requestId}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Request history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No requests yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div
                  key={req.requestId}
                  className="flex items-start justify-between rounded-md border p-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {statusBadge(req.status)}
                      <span className="text-sm font-medium">
                        {req.accountName}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {req.taskDescription}
                    </p>
                    {req.reviewNote && (
                      <p className="text-xs text-muted-foreground">
                        Review: {req.reviewNote}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(req.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
