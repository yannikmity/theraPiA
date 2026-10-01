import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

import { LoginForm } from "../../app/(auth)/auth/login/LoginForm";

describe("LoginForm", () => {
  it("verlinkt „Passwort vergessen?“ auf die Seite zum Anfordern", () => {
    render(<LoginForm notice={null} />);
    expect(screen.getByRole("link", { name: "Passwort vergessen?" }).getAttribute("href")).toBe("/auth/forgot");
  });
});
