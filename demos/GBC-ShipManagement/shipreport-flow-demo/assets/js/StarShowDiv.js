$(window).on('load', function(){setTimeout(removeLoader, 1000)});
function removeLoader(){
    $( "#StarShowDiv" ).fadeOut(500, function() {
    // 淡出

    $( "#StarShowDiv" ).remove(); //結束移除DIV

    
});  
}
