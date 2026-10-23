import { render, screen } from "@testing-library/react";
import { useContext } from "react";
import { describe, expect, it } from "vitest";
import FiltersProvider from "@/context/FiltersContext/FiltersProivder";
import { FiltersContext } from "@/context/FiltersContext/FiltersContext";
import { serializeSalesFilters } from "@/components/Billing/serialize-sales-filters";

function SerializedInitialFilters() {
  const { filtersState } = useContext(FiltersContext);
  const filters = serializeSalesFilters(filtersState);

  const inactiveFilters = {
    seller: filtersState.Seller.active,
    startDate: filtersState.startDate.active,
    endDate: filtersState.endDate.active,
  };

  return (
    <>
      <output data-testid="serialized-filters">{JSON.stringify(filters)}</output>
      <output data-testid="inactive-filters">{JSON.stringify(inactiveFilters)}</output>
    </>
  );
}

describe("FiltersProvider initial SalesTable filters", () => {
  it("serializes initial filters as unrestricted for paid sales", () => {
    render(
      <FiltersProvider>
        <SerializedInitialFilters />
      </FiltersProvider>,
    );

    expect(screen.getByTestId("inactive-filters").textContent).toBe(
      JSON.stringify({ seller: false, startDate: false, endDate: false }),
    );
    expect(screen.getByTestId("serialized-filters").textContent).toBe(
      JSON.stringify({ documentTypes: [], paymentMethods: [] }),
    );
  });
});
