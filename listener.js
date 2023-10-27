


window.addEventListener("load", function () {


});



(() => {
    // Should be useless
    if (!window.fetch) return;
  
    const oldFetch = window.fetch;
    const responseProxy = (response, text) => {
  
      const proxy = new Proxy(response, {
        get(obj, prop) {
  
          if(prop === 'text'){
            return () => Promise.resolve(text);
          }
          if(prop === "body"){
            return new ReadableStream({
              start(controller){
                  controller.enqueue(new TextEncoder().encode(text));
                  controller.close();
              }
          });
          }
  
          return obj[prop];
        }
      })
  
      return proxy;
    };
  
    const handleResponse = async (url, response, headers) => {
      if (!checkUrl(url)) {
        return response;
      }
  
      const idC = document.getElementById("zezoDashId");
      if (idC) {
        let text;
        try {
          text = await response.text();
          chrome.runtime.sendMessage(
            idC.getAttribute("extId"),
            {
              url,
              req: JSON.stringify(headers),
              resp: text,
              type: "data",
            },
            function (response) {
              manageAnswer(response);
            }
          );
          return responseProxy(response, text);
        } catch (err) {
          console.error(err);
  
          if(text){
            return responseProxy(response, text);
          }
        }
      }
  
      return response;
    };
  
    window.fetch = async function (input, init) {
      try {
        let headers = init?.headers ?? {};
        let url = "";
        if ( init.body instanceof Blob) {
          try {
              headers = JSON.parse(await  init.body.text());
          } catch {}
        }
        if (typeof input === "string") {
          // Unity use that
          url = input;
        } else if (input instanceof URL) {
          // Fallback
          url = input.toString();
        } else {
          // Unknown input
        }
  
        if (
          url.startsWith("https://static.virtualregatta.com/winds/live/") &&
          url.endsWith("wnd")
        ) {
          try {
            const string = JSON.stringify(headers);
            const idC = document.getElementById("zezoDashId");
  
            if (string != "" && idC) {
              chrome.runtime.sendMessage(
                idC.getAttribute("extId"),
                { url: url, req: "wndCycle", resp: "wndVal", type: "wndCycle" },
                function (response) {
                  manageAnswer(response);
                }
              );
            }
          } catch (err) {
            console.error(err);
          }
        }
  
        const response = await oldFetch(input, init);
  
        return handleResponse(url, response, headers);
      } catch (error) {
        console.error(error);
        return oldFetch(input, init);
      }
    };
  })();

  
function checkUrl(url) {
    if(!url) return false;
    url = url ? url.toLowerCase() : url;
            
    if(url &&
    (url.startsWith("https://prod.vro.sparks.virtualregatta.com")
    || url.startsWith("https://vro-api-ranking.prod.virtualregatta.com")
    || url.startsWith("https://vro-api-client.prod.virtualregatta.com"))) 
        return true;
    else
        return false;

}

function manageAnswer(msg) {
  //Send alive to maintain port open between the 2 tab
  const idC = document.getElementById("zezoDashId");
  if (idC) {
    try {
        chrome.runtime.sendMessage(
          idC.getAttribute("extId"),
          { url: url, req: "alive" },
          function (response) {
            manageAnswer(response);
          }
        );
    } catch (err) {
      console.error(err);
    }
  }


}


