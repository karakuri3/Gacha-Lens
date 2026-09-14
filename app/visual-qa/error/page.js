"use client";

import ErrorPage from "../../error";

const fixtureError = new Error("Visual QA error-state fixture");

export default function VisualQaErrorPage() {
  return <ErrorPage error={fixtureError} reset={() => {}} />;
}
