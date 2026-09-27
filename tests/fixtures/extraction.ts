import type { ExtractionResult } from "@/core/extraction/proposal";

// What a model might return for fixtures/sample-hotel-contract.pdf, including one
// paraphrased quote (must fail verification) and one incomplete payment (must be flagged).
export const sampleExtraction: ExtractionResult = {
  contract: { currency: "EUR", contractedValue: 118560, signedDate: "2027-03-12" },
  payments: [
    {
      label: "First deposit",
      dueDate: "2027-03-26",
      dueTime: null,
      amount: null,
      percentOfContract: 30,
      refundable: false,
      sources: [{ field: "percentOfContract", quote: "A first deposit of 30% of the estimated total contract value", page: 2 }],
    },
    {
      label: "Second deposit",
      dueDate: null,
      dueTime: null,
      amount: 35000,
      percentOfContract: null,
      refundable: false,
      sources: [{ field: "amount", quote: "A second deposit of EUR 35,000.00 is due on 15 August 2027", page: 2 }],
    },
  ],
  roomBlocks: [
    {
      blockName: "Group block",
      nights: [
        { date: "2027-10-14", rooms: 80, rate: 176 },
        { date: "2027-10-15", rooms: 150, rate: 176 },
        { date: "2027-10-16", rooms: 150, rate: 176 },
      ],
      commitmentPct: 85,
      basis: "PER_NIGHT",
      damagesPct: 100,
      cutoffDate: "2027-09-13",
      cutoffTime: "17:00",
      reviewPoints: [{ date: "2027-08-01", maxReductionPct: 10 }],
      sources: [
        // Quote spans a line break in the PDF text: must still verify.
        { field: "commitmentPct", quote: "utilize at least eighty-five percent (85%) of the contracted room block on each night", page: 1 },
        // Wrong page number: must be found on the right page.
        { field: "cutoffDate", quote: "Reservations must be received by 5:00 pm local time on 13 September 2027", page: 2 },
        // Paraphrase: must not verify.
        { field: "damagesPct", quote: "The group pays full rate for every unsold committed room", page: 1 },
      ],
    },
  ],
  fbMinimums: [
    {
      label: "Food and beverage minimum",
      minimum: 36000,
      basis: "PRE_TAX_PRE_SERVICE",
      surchargePct: 23,
      sources: [{ field: "minimum", quote: "minimum food and beverage expenditure of EUR 36,000.00, exclusive of service charge and tax", page: 2 }],
    },
  ],
  cancellations: [
    {
      basis: "CONTRACT_VALUE",
      depositTreatment: "CREDITED",
      tiers: [
        { startsOn: "2027-06-01", penaltyPct: 50, penaltyFixed: null },
        { startsOn: "2027-03-12", penaltyPct: 20, penaltyFixed: null },
        { startsOn: "2027-09-01", penaltyPct: 100, penaltyFixed: null },
      ],
      sources: [{ field: "tiers", quote: "the following cancellation charges, calculated on the estimated total contract value, will apply", page: 2 }],
    },
  ],
  finalGuarantees: [
    {
      subject: "FB_COVERS",
      dueDate: "2027-10-11",
      dueTime: "12:00",
      tolerancePct: null,
      sources: [{ field: "dueDate", quote: "no later than 12:00 noon local time on 11 October 2027", page: 2 }],
    },
  ],
  otherDeadlines: [
    {
      label: "Rooming list",
      dueDate: "2027-09-30",
      dueTime: null,
      sources: [{ field: "dueDate", quote: "The rooming list must be submitted by 30 September 2027", page: 2 }],
    },
  ],
};
