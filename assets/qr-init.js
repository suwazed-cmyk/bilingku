(function(){document.querySelectorAll("img[data-qr]").forEach(function(el){try{var q=qrcode(0,"L");q.addData(el.getAttribute("data-qr"));q.make();el.src=q.createDataURL(6,0);}catch(e){}});})();
