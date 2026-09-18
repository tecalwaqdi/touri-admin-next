#!/usr/bin/env node
import { runDomainProductionPilot } from "./lib/domain-production-pilot-harness.mjs";
import { getPilotDefinition } from "./lib/domain-pilot-definitions.mjs";

runDomainProductionPilot(getPilotDefinition("partner"));
