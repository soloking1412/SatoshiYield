import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GetSbtcModal } from "../../src/components/wallet/GetSbtcModal.js";
import { SBTC_BRIDGE_URL } from "../../src/constants/links.js";

describe("GetSbtcModal", () => {
  it("links to the official Stacks bridge, opening safely in a new tab", () => {
    render(<GetSbtcModal onClose={() => {}} />);
    const link = screen.getByRole("link", { name: /open the sBTC bridge/i });
    // Verified official destination — a wrong URL here would be a phishing risk.
    expect(link).toHaveAttribute("href", SBTC_BRIDGE_URL);
    expect(SBTC_BRIDGE_URL).toBe("https://app.stacks.co");
    expect(link).toHaveAttribute("target", "_blank");
    // rel must include noopener to prevent reverse-tabnabbing.
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("closes when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<GetSbtcModal onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
