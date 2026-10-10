"use client";

import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/services/api-error";
import { settingsService } from "@/services/settings.service";

const emptyForm = {
  newPassword: "",
  confirmPassword: "",
};

export function AdminSecuritySettings() {
  const [form, setForm] = useState(emptyForm);
  const mismatch = Boolean(
    form.confirmPassword && form.newPassword !== form.confirmPassword,
  );
  const mutation = useMutation({
    mutationFn: settingsService.changePassword,
    onSuccess: () => {
      setForm(emptyForm);
      toast.success("Password changed successfully.");
    },
    onError: (error) =>
      toast.error(getApiErrorMessage(error, "Password could not be changed.")),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mismatch) mutation.mutate(form);
  }
  return (
    <form onSubmit={submit}>
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-xl">
            <ShieldCheck className="size-5 text-primary" /> Password & Security
          </CardTitle>
          <CardDescription>
            Use a strong, unique password for your administrator account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-5 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="new-password">New password</FieldLabel>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={form.newPassword}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      newPassword: event.target.value,
                    }))
                  }
                />
                <FieldDescription>
                  Use at least eight characters.
                </FieldDescription>
              </Field>
              <Field data-invalid={mismatch}>
                <FieldLabel htmlFor="confirm-password">
                  Confirm new password
                </FieldLabel>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  aria-invalid={mismatch}
                  value={form.confirmPassword}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      confirmPassword: event.target.value,
                    }))
                  }
                />
                {mismatch && <FieldError>Passwords do not match.</FieldError>}
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={mutation.isPending || mismatch}>
            <KeyRound data-icon="inline-start" />
            Update password
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
