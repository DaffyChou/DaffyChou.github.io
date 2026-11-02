const profileImgBlock = document.querySelectorAll('.profile-img-setting');
const uploadImgInputs = document.querySelectorAll('.upload-input');
const uploadImgInput = document.querySelector('#uploadImgInput');
const resetProfileImg = document.querySelector('#resetProfileImg');

console.log(uploadImgInputs);

uploadImgInputs.forEach((input)=>{
    input.addEventListener('change', function (e) {
        console.log('改變圖片');
        
        if (!e.target.matches('.upload-input')) return;
    
        const file = e.target.files[0];
        if (!file?.type.startsWith("image/")) {
            e.target.value = "";
            return;
        }
    
        const wrapper = e.target.closest('.set-profile-img');
        const preview = wrapper.querySelector('.preview-img');
        const newUrl = URL.createObjectURL(file);
        preview.src = newUrl;
    
        preview.onload = () => URL.revokeObjectURL(newUrl);
        // input.value = newUrl;
    
    });
});
// uploadImgInput.addEventListener('change', function (e) {
//     console.log('改變圖片');
    
//     if (!e.target.matches('.upload-input')) return;

//     const file = e.target.files[0];
//     if (!file?.type.startsWith("image/")) {
//         e.target.value = "";
//         return;
//     }

//     const wrapper = e.target.closest('.set-profile-img');
//     const preview = wrapper.querySelector('.preview-img');
//     const newUrl = URL.createObjectURL(file);
//     preview.src = newUrl;

//     preview.onload = () => URL.revokeObjectURL(newUrl);

// });

profileImgBlock.forEach((e)=>{
    e.addEventListener("click", function (e) {    
        if (e.target.id === "resetProfileImg") {
            const block = e.target.closest('.profile-img-setting');
        
            const preview = block.querySelector('.preview-img');
            const upload = block.querySelector('.upload-input');
        
            preview.src = '/assets/img/john_photo.png';
            upload.value = '';
        }        
    });
});

async function uploadProfileImage() {
    const file = uploadImgInput.files[0];
    const formData = new FormData();
    formData.append("profileImage", file); // 後端接收的 key
    formData.append("userId", 12345); // 若需要其他參數
  
    // const response = await axios.post("/api/upload-profile", formData, {
    //   headers: { "Content-Type": "multipart/form-data" }
    // });
  
    console.log(formData);
  }