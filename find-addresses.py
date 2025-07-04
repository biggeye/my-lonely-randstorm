#!/usr/bin/env python3
import os
import sys
import time
import requests

API_KEY = os.getenv("BITQUERY_API_KEY")
if not API_KEY:
    print("Error: set BITQUERY_API_KEY environment variable.", file=sys.stderr)
    sys.exit(1)

ENDPOINT = "https://graphql.bitquery.io/"

HEADERS = {
    "Content-Type": "application/json",
    "X-API-KEY": API_KEY
}

def run_query(query: str, variables: dict):
    resp = requests.post(
        ENDPOINT,
        json={"query": query, "variables": variables},
        headers=HEADERS
    )
    resp.raise_for_status()
    data = resp.json()
    if "errors" in data:
        raise Exception(data["errors"])
    return data["data"]

# 1) Fetch all addresses whose *first* received UTXO predates Jan 1, 2011
query_first_in = """
query ($cutoff: ISO8601DateTime!) {
  bitcoin(network: bitcoin) {
    outputs(
      date: {before: $cutoff}              # filter by block time < cutoff  :contentReference[oaicite:0]{index=0}
      options: {limit: 10000,               # adjust as needed
                groupBy: ["outputAddress.address"]}
    ) {
      outputAddress {
        address
      }
      min {
        block {
          timestamp {
            time
          }
        }
      }
    }
  }
}
"""

vars1 = {"cutoff": "2011-01-01T00:00:00"}    # wallets “created” before 2011 :contentReference[oaicite:1]{index=1}
data1 = run_query(query_first_in, vars1)
addresses = [item["outputAddress"]["address"]
             for item in data1["bitcoin"]["outputs"]]

print(f"Found {len(addresses)} candidate addresses pre-2011…")

# 2) For each, fetch total received, total spent, compute balance & check no spends
query_balance = """
query ($addr: String!) {
  bitcoin(network: bitcoin) {
    outputs(outputAddress: {is: $addr}) {
      sum { value }
    }
    inputs(inputAddress: {is: $addr}) {
      count
      sum { value }
    }
  }
}
"""

dormant = []
for addr in addresses:
    result = run_query(query_balance, {"addr": addr})
    received = result["bitcoin"]["outputs"][0]["sum"]["value"] or 0
    spent    = result["bitcoin"]["inputs"][0]["sum"]["value"] or 0
    outs     = result["bitcoin"]["inputs"][0]["count"] or 0

    balance = received - spent
    if outs == 0 and balance > 0:
        dormant.append({"address": addr, "balance": balance})

    # be nice to the API, avoid rate‐limiting
    time.sleep(0.2)

print(f"{len(dormant)} truly “dormant” wallets with positive balance:")
for w in dormant:
    print(f" • {w['address']}  → {w['balance']} satoshis")
