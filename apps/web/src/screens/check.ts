import type { VendorRow } from "@alibi/contracts";
import { isValidGstin } from "@alibi/core";
import { ApiClientError, getVendors, loadSample, postCheck } from "../api.js";
import type { Screen } from "../state.js";
import { button, errorBox, pageHeader, sampleBadge } from "../ui/components.js";
import { clear, el, link } from "../ui/dom.js";

const CHECK_DIGIT_MESSAGE =
  "That is not a valid GSTIN: the last character is a check digit and it does not match.";

/** The three sample suppliers worth trying first, each with the reason it is worth trying. */
const SAMPLES: Array<{ legal_name: string; note: string }> = [
  {
    legal_name: "Meridian Traders",
    note: "One of five suppliers that share a bank account, an address and a filing IP address; it comes back flagged.",
  },
  {
    legal_name: "Sundaram Steel Traders",
    note: "Holds several GSTINs under one PAN because it trades from more than one state, which is ordinary; it comes back clear.",
  },
  {
    legal_name: "Vaishnavi Traders",
    note: "Has never been captured, so the register has nothing on record for it; it comes back unknown.",
  },
];

const strip = (value: string): string => value.replace(/\s+/g, "").toUpperCase();

const asSentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

/** Whatever went wrong, say it as a sentence. */
const reason = (error: unknown): string =>
  asSentence(
    error instanceof ApiClientError ? error.message : "The connection to the server failed.",
  );

export const checkScreen: Screen = async (root, _params, ctx) => {
  ctx.setTitle("Check a supplier");

  const input = el("input", {
    class: "input",
    type: "text",
    name: "gstin",
    maxlength: "15",
    autocomplete: "off",
    spellcheck: "false",
    autocapitalize: "characters",
    placeholder: "27AAPFU0939F1ZV",
    "aria-label": "Supplier GSTIN",
    dataset: { testid: "gstin" },
  });
  const submit = button("Check", { type: "submit", dataset: { testid: "check" } });
  const messages = el("div", { class: "check-messages" });

  const showFieldError = (text: string): void => {
    clear(messages);
    messages.append(el("p", { class: "field-error", role: "alert" }, text));
  };
  const showErrorBox = (text: string): void => {
    clear(messages);
    messages.append(errorBox(text));
  };

  /** Uppercases and de-spaces as the finance person types, and refuses a bad check digit here. */
  const validate = (): string => {
    const cleaned = strip(input.value);
    if (cleaned !== input.value) {
      const caret = input.selectionStart;
      input.value = cleaned;
      if (caret !== null) {
        const at = Math.min(caret, cleaned.length);
        input.setSelectionRange(at, at);
      }
    }
    if (cleaned.length === 15 && !isValidGstin(cleaned)) {
      showFieldError(CHECK_DIGIT_MESSAGE);
      submit.disabled = true;
    } else {
      clear(messages);
      submit.disabled = false;
    }
    return cleaned;
  };

  let pending = false;
  const run = async (): Promise<void> => {
    if (pending) return;
    const gstin = validate();
    if (submit.disabled) return;
    pending = true;
    submit.disabled = true;
    submit.textContent = "Checking…";
    try {
      const result = await postCheck(gstin);
      ctx.navigate(`/checks/${encodeURIComponent(result.id)}`);
    } catch (error) {
      pending = false;
      submit.disabled = false;
      submit.textContent = "Check";
      if (error instanceof ApiClientError && error.field === "gstin") {
        showFieldError(asSentence(error.message));
      } else {
        showErrorBox(`That check could not be sent. ${reason(error)}`);
      }
    }
  };

  input.addEventListener("input", () => {
    validate();
  });

  const form = el(
    "form",
    {
      class: "check-form",
      novalidate: true,
      onSubmit: (event: Event) => {
        event.preventDefault();
        void run();
      },
    },
    el("div", { class: "check-row" }, input, submit),
    messages,
  );

  const samples = el("section", { class: "card check-samples" });

  const renderSamples = async (): Promise<void> => {
    clear(samples);
    samples.append(
      el("h2", null, "Try a sample GSTIN"),
      el("p", { class: "muted check-loading" }, "Reading the sample register…"),
    );
    let vendors: VendorRow[];
    try {
      vendors = await getVendors();
    } catch (error) {
      clear(samples);
      samples.append(
        el("h2", null, "Try a sample GSTIN"),
        errorBox(`The sample register could not be read just now. ${reason(error)}`),
      );
      return;
    }
    const rows = SAMPLES.map((sample) => ({
      ...sample,
      row: vendors.find((vendor) => vendor.legal_name === sample.legal_name),
    }));
    clear(samples);
    samples.append(el("h2", null, "Try a sample GSTIN"));
    if (rows.every((entry) => entry.row === undefined)) {
      const loadButton = button("Load sample data", {
        class: "btn-secondary",
        dataset: { testid: "load-sample" },
      });
      loadButton.addEventListener("click", () => {
        void (async () => {
          loadButton.disabled = true;
          loadButton.textContent = "Loading…";
          try {
            await loadSample();
          } catch (error) {
            samples.append(
              errorBox(`The sample register could not be loaded just now. ${reason(error)}`),
            );
            loadButton.disabled = false;
            loadButton.textContent = "Load sample data";
            return;
          }
          await renderSamples();
        })();
      });
      samples.append(
        el("p", null, "The sample register is not loaded in this workspace yet."),
        loadButton,
      );
      return;
    }
    samples.append(
      el(
        "ul",
        { class: "sample-list" },
        rows.map((entry, index) => {
          const row = entry.row;
          if (!row) return null;
          const fill = button(row.legal_name, {
            class: "btn-secondary sample-btn",
            dataset: { testid: `sample-${index}` },
          });
          fill.append(sampleBadge());
          fill.addEventListener("click", () => {
            input.value = row.gstin;
            validate();
            input.focus();
          });
          return el(
            "li",
            { class: "sample" },
            fill,
            el("p", { class: "sample-note" }, entry.note),
            el("p", { class: "mono sample-gstin" }, row.gstin),
          );
        }),
      ),
    );
  };

  root.append(
    pageHeader({
      eyebrow: "Before you buy",
      title: "Check a supplier.",
      lede: "Enter the GSTIN on the quotation or invoice. Alibi records what the register says today, seals it, and keeps it for the day a notice arrives.",
    }),
    form,
  );
  if (ctx.mode.sample) root.append(samples);
  root.append(
    el(
      "p",
      { class: "check-links" },
      link("/vendors", "Upload your vendor list"),
      " to record every supplier you buy from, not only the one on the invoice in front of you.",
    ),
  );

  if (ctx.mode.sample) await renderSamples();
};
