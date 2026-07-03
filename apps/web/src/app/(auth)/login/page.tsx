"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">IAM Access Hub</CardTitle>
          <CardDescription>
            Sign in with your AWS SSO identity to access the portal
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            className="w-full"
            onClick={() => {
              // signIn("aws-sso") — will be wired up with NextAuth
              window.location.href = "/api/auth/signin/aws-sso";
            }}
          >
            Sign in with AWS SSO
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Only authorized users with an IAM Identity Center identity can
            access this portal. All sessions are logged and monitored.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
