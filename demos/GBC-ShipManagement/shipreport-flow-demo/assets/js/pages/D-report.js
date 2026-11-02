// 新增貨物圖片
const cargo_img_upload_div = document.getElementById("cargo_img_upload_div");

let cargoCount = 0;

// 初始化貨物數量
function initializeCargoBox() {
  const existingCargoDivs = cargo_img_upload_div.querySelectorAll("div[data-cargo]");
  cargoCount = existingCargoDivs.length;

  // 清空現有內容
  // cargo_img_upload_div.innerHTML = "";

  // 重新建立所有區塊或創建初始區塊
  if (cargoCount === 0) {
    createAndAppendCargoBlock(0); // 如果沒有任何區塊，創建一個初始區塊
    cargoCount = 1; // 更新貨物數量
  } else {
	/*
    for (let i = 0; i < cargoCount; i++) {
      createAndAppendCargoBlock(i); // 重新建立所有區塊
    }
	*/
  }

  // 確保只有最後一個區塊有新增按鈕
  updateButtons();
}

// 創建並附加貨物區塊
function createAndAppendCargoBlock(index, CargoImageID = '') {
  const newCargoDiv = createCargoBlock(index, CargoImageID);
  cargo_img_upload_div.appendChild(newCargoDiv);

  // 綁定按鈕事件
  const deleteBtn = newCargoDiv.querySelector(".delete_cargo_img_upload_btn");
  const createBtn = newCargoDiv.querySelector(".create_cargo_img_upload_btn");
  if (deleteBtn) bindDeleteCargoBtn(deleteBtn);
  if (createBtn) bindCreateCargoBtn(createBtn);
}

// 綁定新增按鈕功能
function bindCreateCargoBtn(btn) {
  btn.addEventListener("click", () => {
	
	
    if (cargo_img_upload_div.querySelectorAll("div[data-cargo]").length >= 8) return; // 限制最多8個區塊

    // 創建新的貨物區塊
    const cargoDiv = createCargoBlock(cargoCount);
    cargo_img_upload_div.appendChild(cargoDiv);

    // 切換 focus 到新創建的輸入框
    const newInput = cargoDiv.querySelector('input[type="text"]');
    if (newInput) {
      newInput.focus();
    }

    // 綁定新區塊的按鈕事件
    const deleteBtn = cargoDiv.querySelector(".delete_cargo_img_upload_btn");
    const createBtn = cargoDiv.querySelector(".create_cargo_img_upload_btn");
    bindDeleteCargoBtn(deleteBtn);

    // 綁定貨物名稱輸入框事件
    bindCargoNameInput();

    bindCreateCargoBtn(createBtn);

    // 更新貨物數量並更新按鈕狀態
    cargoCount++;

    updateButtons();

    // 當達到最大區塊數量時，刪除最後一個區塊的新增按鈕
    if (cargo_img_upload_div.querySelectorAll("div[data-cargo]").length === 8) {
      const lastCreateBtn = cargo_img_upload_div.querySelector(
        ".create_cargo_img_upload_btn",
      );
      if (lastCreateBtn) {
        lastCreateBtn.remove();
      }
    }
  });
}

// 綁定刪除按鈕功能
function bindDeleteCargoBtn(btn) {
  btn.addEventListener("click", () => {
    const cargoToDelete = cargo_img_upload_div.querySelector(
      `div[data-cargo="${btn.getAttribute("data-cargo")}"]`,
    );
    if (cargoToDelete) {
      // 刪除貨物區塊
      cargo_img_upload_div.removeChild(cargoToDelete);
      //cargoCount--;

      // 如果刪除後沒有區塊，立即新增一個新的區塊
      if (cargo_img_upload_div.querySelectorAll("div[data-cargo]").length <= 0) {
        createAndAppendCargoBlock(0);
        cargoCount = 1; // 更新貨物數量
      }

      updateButtons();

      // 刪除對應的預覽圖片
      const galleryPreview = document.querySelector(
        `a[data-cargo="${btn.getAttribute("data-cargo")}"]`,
      );
      if (galleryPreview) {
        gallery.removeChild(galleryPreview);
        initLightGallery();
      }
    }
    // 當刪除後區塊數量少於8時，確保最後一個區塊有新增按鈕

    const allCargoDivs =
      cargo_img_upload_div.querySelectorAll("div[data-cargo]");
    let lastCargoDiv = allCargoDivs[allCargoDivs.length - 1];
    if (
      cargo_img_upload_div.querySelectorAll("div[data-cargo]").length < 8 &&
      lastCargoDiv &&
      !lastCargoDiv.querySelector(".create_cargo_img_upload_btn")
    ) {
      const createBtn = document.createElement("button");
      createBtn.type = "button";
      createBtn.className =
        "create_cargo_img_upload_btn btn btn-sm btn-outline-primary text-nowrap flex-grow-1 text-hover-white";
      createBtn.textContent = "新增";
      createBtn.setAttribute(
        "data-cargo",
        lastCargoDiv.getAttribute("data-cargo"),
      );
      bindCreateCargoBtn(createBtn);
      lastCargoDiv.querySelector(".d-flex.gap-2").appendChild(createBtn);
    }
    // 取得被點擊的刪除按鈕的 data-cargo 屬性值
    const deletedCargoIndex = btn.getAttribute("data-cargo");
    // 若刪除的不是最後一個區塊，則不進行 focus 切換
    if ( deletedCargoIndex != cargoCount -1) {
      return;
    } else {
      // 切換 focus 到最後一個輸入框
      lastCargoDiv = allCargoDivs[allCargoDivs.length - 1];
      const lastCargoDivInput =
        lastCargoDiv.querySelector('input[type="text"]');

      if (lastCargoDivInput) {
        lastCargoDivInput.focus();
      }
    }
  });
}

// 創建新的貨物區塊
function createCargoBlock(index, CargoImageID = '') {
  const cargoDiv = document.createElement("div");
  cargoDiv.classList.add(
    "d-flex",
    "flex-column",
    "flex-md-row",
    "mb-2",
    "border",
    "p-2",
    "bg-white",
    "justify-content-start",
  );
  cargoDiv.setAttribute("data-cargo", index);

  cargoDiv.innerHTML = `
        <div class="d-flex align-items-center w-100">      
			<input type="hidden" id="CargoImageID-${index}" value="${CargoImageID}"> 
            <input type="text" id="cargoInputName${index}" class="cargo_img_name form-control form-control-sm mb-sm-1 mb-md-0 me-2" placeholder="請輸入貨物名稱..." value="" data-cargo="${index}" >
            <label title="上傳圖片">
            	<span id="IsUpload1-${index}" class="btn btn-sm btn-outline-warning fs-14 mb-sm-1 mb-md-0 me-md-2 text-dark" data-cargo="${index}"> 
            		<i id="IsUpload2-${index}" class="uploadIcon fa-solid fa-upload"></i>
        		</span>
            	<input class="cargo_img_file form-control form-control-sm me-sm-2 d-none" id="cargoImgFile${index}" type="file" accept="image/*" data-cargo="${index}">
            </label>
        </div>    
        <div class="d-flex gap-2 mt-2 mt-sm-0 justify-content-between">
            <button type="button" class="delete_cargo_img_upload_btn btn btn-sm btn-outline-danger text-nowrap flex-grow-1" data-cargo="${index}">刪除</button>
            <button type="button" class="create_cargo_img_upload_btn btn btn-sm btn-outline-primary text-nowrap flex-grow-1 text-hover-white" data-cargo="${index}">新增</button>
        </div>
    `;
  
  return cargoDiv;
}

// 更新所有區塊的按鈕狀態
function updateButtons() {
  const allCargoDivs = cargo_img_upload_div.querySelectorAll("div[data-cargo]");
  const allCreateBtns = cargo_img_upload_div.querySelectorAll(
    ".create_cargo_img_upload_btn",
  );
  const allDeleteBtns = cargo_img_upload_div.querySelectorAll(
    ".delete_cargo_img_upload_btn",
  );

  // 更新新增按鈕狀態：只保留最後一個區塊的新增按鈕
  allCreateBtns.forEach((btn, index) => {
    if (index !== allCreateBtns.length - 1) {
      btn.remove(); // 移除非最後一個區塊的新增按鈕
    }
  });
}

// ====上傳圖片預覽=================================================
// gallery 容器
const gallery = document.getElementById("gallery");
// ====GLightbox=================================================
const lightbox = GLightbox({
  selector: ".glightbox",
  touchNavigation: true,
  loop: true,
});

function initLightGallery() {
  lightbox.reload();
}

// 綁定圖片上傳並更新預覽功能
function bindFileInput() {
  // 使用事件委派，將事件綁定到父容器
  cargo_img_upload_div.addEventListener("change", (event) => {
    // 確保事件目標是 .cargo_img_file
    console.log("File input change event triggered");
    if (event.target && event.target.classList.contains("cargo_img_file")) {
      handleFileChange(event);
    }
  });
}

function handleFileChange(event) {
  const input = event.target;
  const cargoId = input.getAttribute("data-cargo");
  const cargoName = input
    .closest("div[data-cargo]")
    .querySelector(".cargo_img_name").value;

  // 調用圖片預覽函數
  previewImage(event, cargoId, cargoName);

  // 更新上傳按鈕樣式
  const uploadBtn = input
    .closest("div[data-cargo]")
    .querySelector(`span[data-cargo="${cargoId}"]`);
  if (uploadBtn) {
    const uploadIcon = uploadBtn.querySelector("i.uploadIcon");
    if (uploadIcon) {
      // 加上fa-regular fa-image 去除fa-solid fa-upload
      uploadIcon.classList.remove("fa-solid", "fa-upload");
      uploadIcon.classList.add("fa-regular", "fa-image");
    }
    uploadBtn.classList.remove("btn-outline-warning");
    uploadBtn.classList.add("btn-warning");
  }
}

// 預覽圖片並更新到 gallery
function previewImage(event, cargoId, cargoName) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      // 檢查是否已存在該 cargoId 的預覽元素，若存在則更新圖片
      let existingPreview = gallery.querySelector(`a[data-cargo="${cargoId}"]`);
      if (existingPreview) {
        // 若存在，則更新圖片
        const img = existingPreview.querySelector("img");
        if (img) {
          // 更新圖片的 src
          img.src = e.target.result;
        }
        // 更新a標籤的大圖 href
        existingPreview.href = e.target.result;
        // 更新圖片標題
        const title = existingPreview.querySelector(".gallery-title");
        if (title) {
          title.textContent = `${cargoName}`;
        }
      } else {
        // 若不存在，則新增一個新的預覽元素
        const newPreview = document.createElement("a");
        newPreview.setAttribute("data-cargo", cargoId);
        newPreview.id = `cargoInputImgLightbox-${cargoId}`; //讓預覽圖片的ID對齊貨物名稱區塊的ID
        newPreview.className =
          "col-3 col-lg-1 gallery-item d-flex flex-column glightbox";
        newPreview.href = e.target.result; // 設置 href 為圖片的 Base64 URL
        newPreview.setAttribute("data-title", `${cargoName}`);
        newPreview.setAttribute("data-type", "image");

        // 建立 img 元素
        const img = document.createElement("img");
        img.src = e.target.result; // 設置圖片的 src
        img.alt = `${cargoName}`;

        // 建立 span 元素作為圖片標題
        const title = document.createElement("span");
        title.className = "gallery-title";
        title.textContent = `${cargoName}`;

        // 將 img 和 span 加入到 <a> 中
        newPreview.appendChild(img);
        newPreview.appendChild(title);

        // 將新的預覽元素加入到 gallery 中
        gallery.appendChild(newPreview);
      }
      initLightGallery();
    };
    reader.readAsDataURL(file); // 讀取圖片並轉換為 Base64 URL
  }
}
// ====同步預覽圖片名稱=================================================
function bindCargoNameInput() {
  const cargoNameInputs = document.querySelectorAll(".cargo_img_name");
  cargoNameInputs.forEach((input) => {
    input.removeEventListener("input", handleCargoNameChange); // 避免重複綁定
    input.addEventListener("input", handleCargoNameChange);
  });
}

function handleCargoNameChange(event) {
  const input = event.target;
  const cargoId = input.getAttribute("data-cargo"); // 獲取對應的 cargoId
  const galleryItem = document.querySelector(
    `#gallery a[data-cargo="${cargoId}"]`,
  );

  if (galleryItem) {
    // 更新 <a> 的 data-title 屬性
    galleryItem.setAttribute("data-title", input.value || "貨物名稱");

    // 更新 <img> 的 alt 屬性
    const img = galleryItem.querySelector("img");
    if (img) {
      img.alt = input.value || "貨物名稱";
    }

    // 更新 .gallery-title 的文本內容
    const title = galleryItem.querySelector(".gallery-title");
    if (title) {
      title.textContent = input.value || "貨物名稱";
    }
  }

  initLightGallery();
}

// 初始化
function Glightbox_init() {
  initializeCargoBox();
  initLightGallery();
  bindFileInput();
  bindCargoNameInput();
}

