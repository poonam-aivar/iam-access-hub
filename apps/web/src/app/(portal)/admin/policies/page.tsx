"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Loader2, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

interface PolicyStatement {
  Effect: string;
  Action: string[];
  Resource: string[];
}

interface PolicyEntry {
  policyId: string;
  name: string;
  description: string;
  statements: PolicyStatement[];
  usedForTasks: string[];
  timesUsed: number;
  createdAt: string;
  createdBy: string;
  lastUsedAt: string;
}

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<PolicyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPolicy, setExpandedPolicy] = useState<string | null>(null);

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/policies");
      if (response.ok) {
        const data = await response.json();
        setPolicies(data.policies || []);
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (policyId: string) => {
    setExpandedPolicy(expandedPolicy === policyId ? null : policyId);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-7 w-7 text-green-600" />
            Policy Library
          </h1>
          <p className="text-muted-foreground">
            Reusable IAM policies. As requests are approved, policies are saved
            here and automatically matched against future requests.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchPolicies}
          disabled={loading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : policies.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No policies in library yet</p>
              <p className="text-xs mt-1">
                Policies will be added here after Lane B requests are approved
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {policies.map((policy) => (
            <Card key={policy.policyId}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      {policy.name}
                      <Badge variant="secondary">
                        Used {policy.timesUsed}x
                      </Badge>
                    </CardTitle>
                    <CardDescription>{policy.description}</CardDescription>
                  </div>
                  <button
                    onClick={() => toggleExpand(policy.policyId)}
                    className="p-1 rounded hover:bg-accent"
                    aria-label="Toggle policy details"
                  >
                    {expandedPolicy === policy.policyId ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </CardHeader>

              {expandedPolicy === policy.policyId && (
                <CardContent className="space-y-3 pt-0">
                  {/* Policy JSON */}
                  <div className="rounded-md bg-muted p-3 font-mono text-xs overflow-x-auto max-h-48 overflow-y-auto">
                    <pre>
                      {JSON.stringify(
                        { Statement: policy.statements },
                        null,
                        2
                      )}
                    </pre>
                  </div>

                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      Created: {new Date(policy.createdAt).toLocaleDateString()}{" "}
                      by {policy.createdBy}
                    </div>
                    <div>
                      Last used:{" "}
                      {new Date(policy.lastUsedAt).toLocaleDateString()}
                    </div>
                  </div>

                  {/* Used for tasks */}
                  {policy.usedForTasks.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Used for:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {policy.usedForTasks.slice(0, 5).map((task, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {task.slice(0, 50)}
                            {task.length > 50 ? "..." : ""}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
