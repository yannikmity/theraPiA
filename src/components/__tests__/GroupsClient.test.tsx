import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../app/(app)/groups/actions", () => ({ addGroup: vi.fn() }));

import { GroupsClient } from "../../app/(app)/groups/GroupsClient";
import { addGroup } from "../../app/(app)/groups/actions";
import { pressEnter, submitButtons } from "../../lib/__tests__/helpers/form-submit";
import { newGroupId, type Group } from "@/types";

const group: Group = {
  id: newGroupId("g-1"),
  name: "Kindergruppe 1",
  startDate: "2026-09-01",
  plannedSessionCount: 20,
  avgKids: 9,
  isActive: true,
  createdAt: "2026-09-01T08:00:00.000Z",
};

describe("GroupsClient", () => {
  it("legt mit Enter im Feld an, nur „Anlegen“ sendet ab und ein zweites Enter während des Speicherns nicht (#51)", async () => {
    let resolve!: (r: Awaited<ReturnType<typeof addGroup>>) => void;
    vi.mocked(addGroup).mockReturnValue(new Promise((r) => (resolve = r)));
    render(<GroupsClient initialGroups={[]} initialGroupSessions={[]} ebmStaffeln={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Erste Gruppe anlegen" }));
    const name = screen.getByLabelText("Gruppenname") as HTMLInputElement;
    expect(submitButtons(name.form!).map((b) => b.textContent)).toEqual(["Anlegen"]);
    fireEvent.change(name, { target: { value: "Kindergruppe 1" } });
    pressEnter(screen.getByLabelText("Kinder (Ø)"));
    act(() => name.form!.requestSubmit());
    expect(addGroup).toHaveBeenCalledTimes(1);
    expect(addGroup).toHaveBeenCalledWith(expect.objectContaining({ name: "Kindergruppe 1", avgKids: 9 }));
    await act(async () => resolve({ success: true, data: { groups: [group], groupSessions: [] } }));
    expect(screen.getByText("Kindergruppe 1")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Neu" }));
    fireEvent.click(screen.getByRole("button", { name: "Formular schließen" }));
    expect(addGroup).toHaveBeenCalledTimes(1);
  });
});
