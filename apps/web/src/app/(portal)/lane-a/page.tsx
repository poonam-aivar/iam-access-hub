"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, Copy, ExternalLink, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { V1_ACCOUNTS } from "@/config/accounts";

interface Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: string;
  region: string;
}

interface SessionResponse {
  sessionId: string;
  credentials: Credentials;
  consoleUrl: string;
  expiresAt: string;
}

export default function LaneAPage() {
  const [accountId, setAccountId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [durationHours, setDurationHours] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SessionResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGetCredentials = async () => {
    if (!accountId || !roleName) {
      setError("Please select an account and role");
      return;
    }

    setLoading(true);
    setError(null);
    setSessionData(null);

    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, roleName, durationHours }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to get credentials");
        return;
      }

      setSessionData(data);
    } catch (err) {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  const copyCliCredentials = async () => {
    if (!sessionData) return;

    const cliExport = [
      `export AWS_ACCESS_KEY_ID="${sessionData.credentials.accessKeyId}"`,
      `export AWS_SECRET_ACCESS_KEY="${sessionData.credentials.secretAccessKey}"`,
      `export AWS_SESSION_TOKEN="${sessionData.credentials.sessionToken}"`,
      `export AWS_DEFAULT_REGION="${sessionData.credentials.region}"`,
    ].join("\n");

    await navigator.clipboard.writeText(cliExport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const timeRemaining = sessionData
    ? Math.max(
        0,
        Math.round(
          (new Date(sessionData.expiresAt).getTime() - Date.now()) / 60000
        )
      )
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Zap className="h-7 w-7 text-blue-500" />
          Instant Access (SSO)
        </h1>
        <p className="text-muted-foreground">
          Select an account and role to get immediate console or CLI access. No
          approval needed — you already have permission.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Account & Role</CardTitle>
          <CardDescription>
            Choose from accounts assigned to your SSO identity
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Account selector */}
          <div className="space-y-2">
            <label htmlFor="account" className="text-sm font-medium">
              AWS Account
            </label>
            <select
              id="account"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              disabled={loading}
            >
              <option value="">Select an account...</option>
              {V1_ACCOUNTS.map((account) => (
                <option key={account.accountId} value={account.accountId}>
                  {account.accountName}
                </option>
              ))}
            </select>
          </div>

          {/* Role selector */}
          <div className="space-y-2">
            <label htmlFor="role" className="text-sm font-medium">
              Permission Set / Role
            </label>
            <input
              id="role"
              type="text"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="e.g., AdministratorAccess, ViewOnlyAccess, DevOps"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Enter the permission set name assigned to your SSO identity for
              this account
            </p>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <label htmlFor="duration" className="text-sm font-medium">
              Session Duration
            </label>
            <select
              id="duration"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={durationHours}
              onChange={(e) => setDurationHours(Number(e.target.value))}
              disabled={loading}
            >
              <option value={1}>1 hour</option>
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

          <Button
            className="w-full"
            onClick={handleGetCredentials}
            disabled={loading || !accountId || !roleName}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Vending Credentials...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Get Credentials
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Credentials output */}
      {sessionData && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Your Credentials
            </CardTitle>
            <CardDescription>
              These expire automatically in {timeRemaining} minutes. Never share
              them.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-background border p-4 font-mono text-xs space-y-1 overflow-x-auto">
              <p className="text-muted-foreground"># Paste into your terminal:</p>
              <p>
                export AWS_ACCESS_KEY_ID=&quot;{sessionData.credentials.accessKeyId}&quot;
              </p>
              <p>
                export AWS_SECRET_ACCESS_KEY=&quot;
                {sessionData.credentials.secretAccessKey}&quot;
              </p>
              <p>
                export AWS_SESSION_TOKEN=&quot;{sessionData.credentials.sessionToken}&quot;
              </p>
              <p>
                export AWS_DEFAULT_REGION=&quot;{sessionData.credentials.region}&quot;
              </p>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={copyCliCredentials}
              >
                {copied ? (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy CLI Credentials
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(sessionData.consoleUrl, "_blank")}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Console
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="success">Active</Badge>
              <span className="text-xs text-muted-foreground">
                Session ID: {sessionData.sessionId} · Expires{" "}
                {new Date(sessionData.expiresAt).toLocaleTimeString()}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
