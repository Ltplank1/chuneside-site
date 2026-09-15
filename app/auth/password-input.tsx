"use client";

import { type ComponentProps, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type">;

export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return <div className="password-input-wrap">
    <Input {...props} className={className ? `password-input ${className}` : "password-input"} type={visible ? "text" : "password"} />
    <button
      type="button"
      className="password-visibility-toggle"
      onClick={() => setVisible((current) => !current)}
      aria-label={visible ? "Hide password" : "Show password"}
      title={visible ? "Hide password" : "Show password"}
    >
      {visible ? <EyeOff /> : <Eye />}
    </button>
  </div>;
}
