## Search

```
http://localhost:2322/api?q=berlin
```

_For more details on the API check the photon [github repository](https://github.com/komoot/photon)._

## FAQ

- How do I pass arguments to the `photon.jar` ?

  _The entrypoint accepts arguments for the `photon.jar`, you can invoke it by using `docker exec`_

- Do I need to have nominatim ?

  _The container downloads the latest prebuilt search index, there is no immediate need to have nominatim installed._

- What is photon ?

  _photon is a geocoder, check out [their website](https://photon.komoot.io/) and their [github repository](https://github.com/komoot/photon)_
