import MenuCard from "./MenuCard";

const RootMenu = () => {
  return (
    <div className="h-full w-full flex flex-col">
      <main className="flex items-center my-auto">
        <section className="w-full mx-auto p-4 flex justify-between md:justify-center md:gap-5 my-auto">
          <MenuCard url="/newBill" title="Facturar">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="icon hover:fill-white opacity-70"
              width="80px"
              height="120px"
              viewBox="0 0 1920 1920"
            >
              <path
                d="M1706.235 1807.059H350.941V112.94h903.53v451.765h451.764v1242.353Zm-338.823-1670.74 315.443 315.447h-315.443V136.32Zm402.182 242.487L1440.372 49.58C1408.296 17.62 1365.717 0 1320.542 0H238v1920h1581.175V498.635c0-45.176-17.618-87.755-49.58-119.83ZM576.823 1242.353h790.589v-112.94H576.823v112.94Zm0-451.765h903.53V677.647h-903.53v112.941Zm0 677.647h451.765v-112.941H576.823v112.941Zm0-451.764h677.648V903.53H576.823v112.941Zm0-451.765h451.765V451.765H576.823v112.941Z"
                fillRule="evenodd"
              />
            </svg>
          </MenuCard>
          <MenuCard url="/searchBill" title="Consultar">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="80px"
              height="120px"
              viewBox="0 0 24 24"
              className="icon hover:fill-white opacity-70"
            >
              <path
                d="M5 4H17M5 8H13M5 12H9M5 16H8M5 20H11M16.4729 17.4525C17.046 16.8743 17.4 16.0785 17.4 15.2C17.4 13.4327 15.9673 12 14.2 12C12.4327 12 11 13.4327 11 15.2C11 16.9673 12.4327 18.4 14.2 18.4C15.0888 18.4 15.893 18.0376 16.4729 17.4525ZM16.4729 17.4525L19 20"
                stroke="#464455"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </MenuCard>
          <MenuCard url="/stock/productDashboard" title="Stock">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              version="1.1"
              id="Layer_1"
              width="80px"
              height="120px"
              viewBox="0 0 484.185 484.185"
            >
              <g>
                <g id="XMLID_31_">
                  <g>
                    <path d="M429.255,0v149.74h-39.904V69.878h-149.74v-39.93H84.854V149.74H49.94V0H0.001v484.185h49.938v-89.844h379.315v89.844     h54.931V0H429.255z M239.611,84.878h134.74v64.861h-134.74V84.878z M149.767,44.948h24.931v44.896h-24.931V44.948z      M99.854,44.948h34.913v59.896h54.931V44.948h34.913V149.74H99.854V44.948z M429.255,164.74v14.948H49.94V164.74H429.255z      M244.576,229.601v39.931H94.836v79.861H49.94V194.688h379.315v154.705h-29.922V229.601H244.576z M259.576,244.601h34.913v59.896     h54.931v-59.896h34.913v104.792H259.576V244.601z M309.49,289.497v-44.896h24.931v44.896H309.49z M244.576,284.532v64.861     h-134.74v-64.861H244.576z M34.94,469.185H15.001V15h19.938L34.94,469.185L34.94,469.185z M49.94,379.341v-14.948h379.315v14.948     H49.94z M469.185,469.185h-24.931V15h24.931V469.185z" />
                    <rect x="326.945" y="109.809" width="19" height="11" />
                    <rect x="267.049" y="109.809" width="29.913" height="11" />
                    <rect x="197.171" y="309.462" width="19.948" height="12" />
                    <rect x="137.275" y="309.462" width="49.913" height="15" />
                  </g>
                </g>
              </g>
            </svg>
          </MenuCard>{" "}
        </section>
      </main>
    </div>
  );
};

export default RootMenu;
